const socket = io();
let activeCode = sessionStorage.getItem('teacherRoom');
const $ = id => document.getElementById(id);
const toast = message => { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 3500); };
function setConnection(connected) { $('connection').textContent = connected ? '● Conectado' : '● Reconectando…'; $('connection').className = `connection ${connected ? 'online' : ''}`; }
function render(data) {
  $('create-view').hidden = true; $('room-view').hidden = false; $('room-code').textContent = data.code;
  $('student-count').textContent = data.student_count; $('response-count').textContent = data.response_count;
  $('student-list').innerHTML = data.students && data.students.length ? data.students.map(name => `<span>${name}</span>`).join('') : 'Nenhum aluno conectado ainda.';
  const s = data.scenario;
  $('report').hidden = data.state !== 'finished';
  if (!s) { $('scenario-label').textContent = 'ATIVIDADE CONCLUÍDA'; $('question').textContent = `Todos os ${data.total_scenarios} cenários foram finalizados.`; $('options').innerHTML = ''; $('distribution').innerHTML = ''; $('teacher-message').textContent = 'Confira o relatório final abaixo.'; renderReport(data.report || [], data.student_report || []); return; }
  const labels = {waiting:'AGUARDANDO INÍCIO', open:'CENÁRIO ABERTO', closed:'RESPOSTAS ENCERRADAS', revealed:'RESPOSTA REVELADA'};
  $('scenario-label').textContent = `CENÁRIO ${s.number} DE ${data.total_scenarios} · ${labels[data.state]}`;
  $('question').textContent = s.question;
  $('options').innerHTML = Object.entries(s.options).map(([k,v]) => `<div class="option"><b>${k}</b>${v}</div>`).join('');
  const max = Math.max(1, ...Object.values(data.distribution || {}));
  $('distribution').innerHTML = Object.entries(data.distribution || {}).map(([k,n]) => `<div class="bar-row"><b>${k}</b><span><i style="width:${n / max * 100}%"></i></span><strong>${n}</strong></div>`).join('');
  $('teacher-message').textContent = data.state === 'open' ? 'Os alunos podem responder agora.' : data.state === 'revealed' ? `Resposta correta: ${s.correct} — ${s.explanation}` : 'Use os controles abaixo para conduzir a atividade.';
}
function renderReport(report) {
  const answers = report.reduce((sum, item) => sum + item.responses, 0), correct = report.reduce((sum, item) => sum + item.correct, 0);
  $('report-summary').textContent = `${correct} acertos em ${answers} respostas (${answers ? Math.round(correct / answers * 100) : 0}% de acerto geral)`;
  $('report-list').innerHTML = report.map(item => `<article><b>Cenário ${item.number}</b><p>${item.question}</p><span>${item.responses} respostas · ${item.correct} acertos · ${item.incorrect} erros · ${item.rate}% de acerto</span></article>`).join('');
  const students = arguments[1] || [];
  $('student-report').innerHTML = students.length ? students.map(item => `<article><b>${item.name}</b><span>${item.correct} de ${report.length} acerto${item.correct === 1 ? '' : 's'}</span></article>`).join('') : '<p>Nenhum aluno participou da atividade.</p>';
}
$('create-room').onclick = () => socket.emit('create_room', {question_count: $('question-count').value});
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => socket.emit('teacher_action', {action: button.dataset.action}));
socket.on('connect', () => { setConnection(true); if (activeCode) socket.emit('teacher_join', {code: activeCode}); });
socket.on('disconnect', () => setConnection(false));
socket.on('room_created', ({code}) => { activeCode = code; sessionStorage.setItem('teacherRoom', code); socket.emit('teacher_join', {code}); });
socket.on('teacher_state', render); socket.on('error_message', ({message}) => toast(message));
