import os
import secrets
import string
import csv
from collections import Counter
from pathlib import Path

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", secrets.token_hex(24))
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

MAX_STUDENTS = 80
QUESTIONS_FILE = Path(__file__).with_name("perguntas.csv")
AUCTIONS_FILE = Path(__file__).with_name("leiloes.csv")


def load_scenarios():
    with QUESTIONS_FILE.open(encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
    required = {"pergunta", "alternativa_a", "alternativa_b", "correta", "explicacao"}
    if not rows or not required.issubset(rows[0]):
        raise RuntimeError("perguntas.csv está vazio ou possui colunas inválidas.")
    scenarios = []
    for row in rows:
        correct = row["correta"].strip().upper()
        if correct not in ("A", "B"):
            raise RuntimeError("A coluna 'correta' deve conter A ou B.")
        scenarios.append({"question": row["pergunta"].strip(),
                          "options": {"A": row["alternativa_a"].strip(), "B": row["alternativa_b"].strip()},
                          "correct": correct, "explanation": row["explicacao"].strip()})
    return scenarios


SCENARIOS = load_scenarios()


def load_auctions():
    with AUCTIONS_FILE.open(encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
    required = {"pergunta", "contexto", "empresa_a", "lance_a", "relevancia_a", "qualidade_a",
                "empresa_b", "lance_b", "relevancia_b", "qualidade_b", "empresa_c",
                "lance_c", "relevancia_c", "qualidade_c", "correta", "explicacao"}
    if not rows or not required.issubset(rows[0]):
        raise RuntimeError("leiloes.csv está vazio ou possui colunas inválidas.")
    auctions = []
    for row in rows:
        correct = row["correta"].strip().upper()
        if correct not in ("A", "B", "C"):
            raise RuntimeError("A coluna 'correta' de leiloes.csv deve conter A, B ou C.")
        companies = []
        for choice in ("a", "b", "c"):
            company = row[f"empresa_{choice}"].strip()
            if company not in ("Nexa", "Tuts", "Orbe"):
                raise RuntimeError("As empresas de leiloes.csv devem ser Nexa, Tuts ou Orbe.")
            companies.append({"choice": choice.upper(), "name": company, "bid": row[f"lance_{choice}"].strip(),
                              "relevance": row[f"relevancia_{choice}"].strip(), "quality": row[f"qualidade_{choice}"].strip()})
        auctions.append({"question": row["pergunta"].strip(), "context": row["contexto"].strip(),
                         "options": {company["choice"]: company["name"] for company in companies},
                         "companies": companies, "correct": correct, "explanation": row["explicacao"].strip(),
                         "activity_type": "auction"})
    return auctions


AUCTIONS = load_auctions()
rooms = {}


def room_code():
    while True:
        code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
        if code not in rooms:
            return code


def room_payload(room, include_distribution=False, student_id=None):
    index = room["scenario_index"]
    scenario = room["scenarios"][index] if index < len(room["scenarios"]) else None
    data = {"code": room["code"], "state": room["state"], "scenario_index": index,
            "total_scenarios": len(room["scenarios"]), "student_count": sum(1 for s in room["students"].values() if s["sid"]),
            "response_count": len(room["responses"]), "finished": index >= len(room["scenarios"]),
            "activity_type": room["activity_type"]}
    if scenario:
        data["scenario"] = {"number": index + 1, "question": scenario["question"], "options": scenario["options"],
                            "activity_type": room["activity_type"]}
        if room["activity_type"] == "auction":
            data["scenario"].update({"companies": scenario["companies"], "context": scenario["context"]})
        if room["state"] == "revealed":
            data["scenario"].update({"correct": scenario["correct"], "explanation": scenario["explanation"]})
    if include_distribution and scenario:
        counts = Counter(room["responses"].values())
        data["distribution"] = {key: counts.get(key, 0) for key in scenario["options"]}
    if include_distribution:
        data["students"] = sorted(s["name"] for s in room["students"].values() if s["sid"])
        if room["state"] == "finished":
            data["report"] = room["report"]
            data["student_report"] = sorted(
                [{"name": student["name"], "correct": room["scores"].get(key, 0)}
                 for key, student in room["students"].items()], key=lambda item: item["name"].lower())
    if student_id and room["state"] == "finished":
        data["my_score"] = room["scores"].get(student_id, 0)
    return data


def broadcast(room):
    if room["state"] == "finished":
        for student_id, student in room["students"].items():
            if student["sid"]:
                socketio.emit("room_state", room_payload(room, student_id=student_id), to=student["sid"])
    else:
        socketio.emit("room_state", room_payload(room), to=room["code"])
    if room["teacher_sid"]:
        socketio.emit("teacher_state", room_payload(room, True), to=room["teacher_sid"])


def get_room(code):
    return rooms.get((code or "").strip().upper())


def teacher_room(sid):
    return next((room for room in rooms.values() if room["teacher_sid"] == sid), None)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/professor")
def professor():
    return render_template("professor.html", activity_counts={"programmatic": len(SCENARIOS), "auction": len(AUCTIONS)})


@app.route("/aluno")
def aluno():
    return render_template("aluno.html")


@socketio.on("create_room")
def create_room(data):
    activity_type = (data or {}).get("activity_type", "programmatic")
    available_scenarios = SCENARIOS if activity_type == "programmatic" else AUCTIONS if activity_type == "auction" else None
    if available_scenarios is None:
        emit("error_message", {"message": "Escolha uma atividade válida."})
        return
    try:
        question_count = int((data or {}).get("question_count", len(available_scenarios)))
    except (TypeError, ValueError):
        emit("error_message", {"message": "Escolha uma quantidade válida de perguntas."})
        return
    if not 1 <= question_count <= len(available_scenarios):
        emit("error_message", {"message": f"Escolha entre 1 e {len(available_scenarios)} rodadas."})
        return
    code = room_code()
    rooms[code] = {"code": code, "teacher_sid": None, "students": {}, "scenario_index": 0,
                   "state": "waiting", "responses": {}, "scenarios": available_scenarios[:question_count], "report": [],
                   "scores": {}, "activity_type": activity_type}
    emit("room_created", {"code": code})


@socketio.on("teacher_join")
def teacher_join(data):
    room = get_room(data.get("code"))
    if not room:
        emit("error_message", {"message": "Sala inexistente."})
        return
    if room["teacher_sid"] and room["teacher_sid"] != request.sid:
        emit("error_message", {"message": "Esta sala já possui um professor conectado."})
        return
    room["teacher_sid"] = request.sid
    join_room(room["code"])
    emit("teacher_state", room_payload(room, True))
    broadcast(room)


@socketio.on("teacher_leave")
def teacher_leave():
    room = teacher_room(request.sid)
    if room:
        leave_room(room["code"])
        room["teacher_sid"] = None
        broadcast(room)


@socketio.on("student_join")
def student_join(data):
    room = get_room(data.get("code"))
    name = (data.get("name") or "").strip()
    student_id = (data.get("student_id") or "").strip()
    if not room:
        emit("error_message", {"message": "Sala inexistente. Confira o código."})
        return
    if not (2 <= len(name) <= 40):
        emit("error_message", {"message": "Informe um nome entre 2 e 40 caracteres."})
        return
    if not student_id:
        student_id = secrets.token_urlsafe(16)
    new_student = student_id not in room["students"]
    if new_student and len(room["students"]) >= MAX_STUDENTS:
        emit("error_message", {"message": "Esta sala está cheia."})
        return
    room["students"][student_id] = {"name": name, "sid": request.sid}
    join_room(room["code"])
    emit("student_joined", {"student_id": student_id, "name": name, "state": room_payload(room),
                             "answered": student_id in room["responses"]})
    broadcast(room)


@socketio.on("student_leave")
def student_leave(data):
    room = get_room((data or {}).get("code"))
    student_id = (data or {}).get("student_id")
    if room and student_id in room["students"] and room["students"][student_id]["sid"] == request.sid:
        leave_room(room["code"])
        room["students"][student_id]["sid"] = None
        broadcast(room)


@socketio.on("answer")
def answer(data):
    room = get_room(data.get("code")); student_id = data.get("student_id"); choice = data.get("choice")
    if not room or student_id not in room["students"]:
        emit("error_message", {"message": "Sua sessão não foi encontrada. Entre novamente."}); return
    if room["students"][student_id]["sid"] != request.sid:
        emit("error_message", {"message": "Sessão inválida."}); return
    if room["state"] != "open":
        emit("error_message", {"message": "As respostas não estão abertas neste momento."}); return
    if student_id in room["responses"]:
        emit("error_message", {"message": "Você já respondeu este cenário."}); return
    if choice not in room["scenarios"][room["scenario_index"]]["options"]:
        emit("error_message", {"message": "Alternativa inválida."}); return
    room["responses"][student_id] = choice
    emit("answer_registered", {"choice": choice})
    broadcast(room)


@socketio.on("teacher_action")
def teacher_action(data):
    room = teacher_room(request.sid)
    if not room:
        emit("error_message", {"message": "Ação não autorizada."}); return
    action = data.get("action")
    if action == "start" and room["state"] in ("waiting", "closed"):
        room["state"] = "open"
    elif action == "close" and room["state"] == "open":
        room["state"] = "closed"
    elif action == "reveal" and room["state"] == "closed":
        room["state"] = "revealed"
    elif action == "next" and room["state"] == "revealed":
        scenario = room["scenarios"][room["scenario_index"]]
        answers = Counter(room["responses"].values())
        total = sum(answers.values())
        correct_count = answers.get(scenario["correct"], 0)
        room["report"].append({"number": room["scenario_index"] + 1, "question": scenario["question"],
                               "responses": total, "correct": correct_count,
                               "incorrect": total - correct_count,
                               "rate": round(correct_count / total * 100) if total else 0})
        for student_id, choice in room["responses"].items():
            if choice == scenario["correct"]:
                room["scores"][student_id] = room["scores"].get(student_id, 0) + 1
        room["scenario_index"] += 1; room["responses"] = {}
        room["state"] = "finished" if room["scenario_index"] >= len(room["scenarios"]) else "waiting"
    else:
        emit("error_message", {"message": "Esta ação não está disponível agora."}); return
    broadcast(room)


@socketio.on("disconnect")
def disconnected():
    sid = request.sid
    for room in rooms.values():
        for student in room["students"].values():
            if student["sid"] == sid:
                student["sid"] = None
        if room["teacher_sid"] == sid:
            room["teacher_sid"] = None
        broadcast(room)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5023)), debug=False,
                 allow_unsafe_werkzeug=True)
