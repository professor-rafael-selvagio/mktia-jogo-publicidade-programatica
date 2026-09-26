# Publicidade em jogo

Atividade em tempo real para diferenciar publicidade tradicional e programática, construída com Flask e Socket.IO. As perguntas ficam em `perguntas.csv`, permitindo editar o conteúdo sem alterar o código. Ao criar a sala, o professor escolhe quantas perguntas da sequência serão usadas; ao fim, o painel exibe um relatório agregado de respostas e acertos por cenário.

## Executar localmente

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python app.py
```

Abra `http://localhost:5000`. Em uma aba, escolha **Sou Professor**, crie a sala e compartilhe o código. Em outra aba (ou outro dispositivo na mesma rede), escolha **Sou Aluno** e entre usando o código. O professor conduz os cinco cenários pelos controles do painel.

## Publicar no Render

1. Envie esta pasta a um repositório Git.
2. No Render, crie um **Web Service** a partir do repositório.
3. Selecione Python; use `pip install -r requirements.txt` como Build Command e `gunicorn --worker-class gthread --workers 1 --threads 100 --bind 0.0.0.0:$PORT app:app` como Start Command (o `Procfile` já contém este comando).
4. O Render fornecerá uma URL como `https://nome-do-servico.onrender.com`.

As salas ficam em memória; portanto, reinicializações do serviço encerram as salas em andamento. Use uma única instância para que todos os participantes compartilhem o mesmo estado.
