# Publicidade em jogo

Atividade em tempo real construída com Flask e Socket.IO, com dois blocos didáticos: **Publicidade Programática** e **Leilão de Anúncios e RTB**. Os conteúdos ficam em `perguntas.csv` e `leiloes.csv`, permitindo editar os cenários sem alterar o código. Ao criar a sala, o professor seleciona o bloco e a quantidade de perguntas ou rodadas.

## Executar localmente

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python app.py
```

Abra `http://localhost:5000`. Em uma aba, escolha **Sou Professor**, selecione o bloco desejado, crie a sala e compartilhe o código. Em outra aba (ou outro dispositivo na mesma rede), escolha **Sou Aluno** e entre usando o código.

No **Bloco 2 — Leilão de Anúncios e RTB**, os alunos analisam as empresas Nexa, Tuts e Orbe, escolhem A, B ou C e discutem por que o maior lance não determina necessariamente o anúncio vencedor.

## Publicar no Render

1. Envie esta pasta a um repositório Git.
2. No Render, crie um **Web Service** a partir do repositório.
3. Selecione Python; use `pip install -r requirements.txt` como Build Command e `gunicorn --worker-class gthread --workers 1 --threads 100 --bind 0.0.0.0:$PORT app:app` como Start Command (o `Procfile` já contém este comando).
4. O Render fornecerá uma URL como `https://nome-do-servico.onrender.com`.

As salas ficam em memória; portanto, reinicializações do serviço encerram as salas em andamento. Use uma única instância para que todos os participantes compartilhem o mesmo estado.
