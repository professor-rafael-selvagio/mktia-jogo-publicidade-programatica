const socket = io();
let activeCode = sessionStorage.getItem('teacherRoom');
const $ = id => document.getElementById(id);
const toast = message => { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 3500); };
const companyCards = companies => companies.map(company => `<article class="company-card"><span class="company-choice">${company.choice}</span><h3>${company.name}</h3><p><b>Lance</b>${company.bid}</p><p><b>Relevância</b>${company.relevance}</p><p><b>Qualidade</b>${company.quality}</p></article>`).join('');
function setConnection(connected) { $('connection').textContent = connected ? '● Conectado' : '● Reconectando…'; $('connection').className = `connection ${connected ? 'online' : ''}`; }
function populateCounts() {
  const total = window.activityCounts[$('activity-type').value];
  $('question-count').innerHTML = Array.from({length: total}, (_, index) => { const number = index + 1; return `<option value="${number}" ${number === total ? 'selected' : ''}>${number} ${$('activity-type').value === 'auction' ? (number === 1 ? 'rodada' : 'rodadas') : (number === 1 ? 'pergunta' : 'perguntas')}</option>`; }).join('');
}
function render(data) {
  $('create-view').hidden = true; $('room-view').hidden = false; $('room-code').textContent = data.code;
  $('student-count').textContent = data.student_count; $('response-count').textContent = data.response_count;
  $('student-list').innerHTML = data.students?.length ? data.students.map(name => `<span>${name}</span>`).join('') : 'Nenhum aluno conectado ainda.';
  const s = data.scenario; $('report').hidden = data.state !== 'finished';
  if (!s) { $('scenario-label').textContent = 'ATIVIDADE CONCLUÍDA'; $('question').textContent = `Todos os ${data.total_scenarios} ${data.activity_type === 'auction' ? 'leilões' : 'cenários'} foram finalizados.`; $('options').innerHTML = ''; $('distribution').innerHTML = ''; $('auction-context').hidden = true; $('auction-companies').hidden = true; $('teacher-message').textContent = 'Confira o relatório final abaixo.'; renderReport(data.report || [], data.student_report || []); return; }
  const labels = {waiting:'AGUARDANDO INÍCIO', open:'RODADA ABERTA', closed:'RESPOSTAS ENCERRADAS', revealed:'RESPOSTA REVELADA'};
  const unit = s.activity_type === 'auction' ? 'RODADA' : 'CENÁRIO';
  $('scenario-label').textContent = `${unit} ${s.number} DE ${data.total_scenarios} · ${labels[data.state]}`;
  $('question').textContent = s.question; $('auction-context').hidden = s.activity_type !== 'auction'; $('auction-context').textContent = s.context || '';
  $('auction-companies').hidden = s.activity_type !== 'auction'; $('auction-companies').innerHTML = s.companies ? companyCards(s.companies) : '';
  $('options').innerHTML = Object.entries(s.options).map(([key, value]) => `<div class="option ${data.state === 'revealed' && key === s.correct ? 'correct-option' : ''}"><b>${key}</b>${value}</div>`).join('');
  const max = Math.max(1, ...Object.values(data.distribution || {}));
  $('distribution').innerHTML = Object.entries(data.distribution || {}).map(([key, count]) => `<div class="bar-row"><b>${key}</b><span><i style="width:${count / max * 100}%"></i></span><strong>${count}</strong></div>`).join('');
  $('teacher-message').textContent = data.state === 'open' ? 'Os alunos podem responder agora.' : data.state === 'revealed' ? `Resposta correta: ${s.correct} — ${s.explanation}` : 'Use os controles abaixo para conduzir a atividade.';
}
function renderReport(report, students) {
  const answers = report.reduce((sum, item) => sum + item.responses, 0), correct = report.reduce((sum, item) => sum + item.correct, 0);
  $('report-summary').textContent = `${correct} acertos em ${answers} respostas (${answers ? Math.round(correct / answers * 100) : 0}% de acerto geral)`;
  $('report-list').innerHTML = report.map(item => `<article><b>Rodada ${item.number}</b><p>${item.question}</p><span>${item.responses} respostas · ${item.correct} acertos · ${item.incorrect} erros · ${item.rate}% de acerto</span></article>`).join('');
  $('student-report').innerHTML = students.length ? students.map(item => `<article><b>${item.name}</b><span>${item.correct} de ${report.length} acerto${item.correct === 1 ? '' : 's'}</span></article>`).join('') : '<p>Nenhum aluno participou da atividade.</p>';
}
$('activity-type').onchange = populateCounts; populateCounts();
$('create-room').onclick = () => socket.emit('create_room', {activity_type: $('activity-type').value, question_count: $('question-count').value});
function returnToCreate() { activeCode = null; sessionStorage.removeItem('teacherRoom'); $('room-view').hidden = true; $('create-view').hidden = false; }
$('teacher-back').onclick = () => { socket.emit('teacher_leave'); returnToCreate(); };
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => { if (button.dataset.action !== 'end' || window.confirm('Encerrar esta sessão? Os alunos não poderão mais entrar ou responder.')) socket.emit('teacher_action', {action: button.dataset.action}); });
socket.on('connect', () => { setConnection(true); if (activeCode) socket.emit('teacher_join', {code: activeCode}); }); socket.on('disconnect', () => setConnection(false));
socket.on('room_created', ({code}) => { activeCode = code; sessionStorage.setItem('teacherRoom', code); socket.emit('teacher_join', {code}); }); socket.on('session_ended', returnToCreate); socket.on('teacher_state', render); socket.on('error_message', ({message}) => toast(message));
