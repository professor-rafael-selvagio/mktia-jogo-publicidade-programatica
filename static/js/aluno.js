const socket = io(); const $ = id => document.getElementById(id);
let session = JSON.parse(localStorage.getItem('publicidadeStudent') || 'null'), answered = false;
const toast = message => { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 3500); };
function setConnection(connected) { $('connection').textContent = connected ? '● Conectado' : '● Reconectando…'; $('connection').className = `connection ${connected ? 'online' : ''}`; }
function join() { if (session) socket.emit('student_join', session); }
function render(data) {
  $('game-view').hidden = false; $('join-view').hidden = true; $('room-code').textContent = data.code; $('student-name').textContent = session.name;
  const s = data.scenario, label = {waiting:'AGUARDANDO INÍCIO',open:'CENÁRIO ABERTO',closed:'RESPOSTAS ENCERRADAS',revealed:'RESPOSTA REVELADA',finished:'ATIVIDADE CONCLUÍDA'}[data.state];
  $('scenario-label').textContent = label;
  if (!s) { $('question').textContent = 'A atividade foi concluída. Obrigado por participar!'; $('options').innerHTML = ''; $('student-message').textContent = ''; $('feedback').hidden = false; $('feedback').innerHTML = `<b>Seu resultado: ${data.my_score || 0} de ${data.total_scenarios} acerto${(data.my_score || 0) === 1 ? '' : 's'}.</b>`; return; }
  $('question').textContent = s.question;
  const canAnswer = data.state === 'open' && !answered;
  $('options').innerHTML = Object.entries(s.options).map(([k,v]) => `<button class="option answer ${canAnswer ? '' : 'disabled'}" data-choice="${k}" ${canAnswer ? '' : 'disabled'}><b>${k}</b>${v}</button>`).join('');
  document.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => socket.emit('answer', {code: session.code, student_id: session.student_id, choice: b.dataset.choice}));
  const messages = {waiting:'Aguarde o professor iniciar o cenário.', open: answered ? 'Resposta registrada. Aguarde o professor.' : 'Escolha uma alternativa e confirme sua resposta.', closed:'As respostas foram encerradas. Aguarde a revelação.', revealed:'Confira a resposta correta abaixo.'};
  $('student-message').textContent = messages[data.state] || '';
  $('feedback').hidden = data.state !== 'revealed';
  if (data.state === 'revealed') $('feedback').innerHTML = `<b>Resposta correta: ${s.correct} — ${s.options[s.correct]}</b><br>${s.explanation}`;
  if (data.state === 'waiting') { answered = false; }
}
$('join-form').onsubmit = e => { e.preventDefault(); session = {code:$('code').value.trim().toUpperCase(), name:$('name').value.trim(), student_id: session?.student_id || crypto.randomUUID()}; join(); };
socket.on('connect', () => { setConnection(true); join(); }); socket.on('disconnect', () => setConnection(false));
socket.on('student_joined', data => { session.student_id = data.student_id; localStorage.setItem('publicidadeStudent', JSON.stringify(session)); answered = data.answered; render(data.state); });
socket.on('room_state', render); socket.on('answer_registered', () => { answered = true; toast('Resposta registrada.'); }); socket.on('error_message', ({message}) => toast(message));
