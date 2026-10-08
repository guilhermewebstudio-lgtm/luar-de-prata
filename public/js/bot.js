(function () {
  var toggle = document.getElementById('botToggle');
  var panel = document.getElementById('botPanel');
  var closeBtn = document.getElementById('botClose');
  var msgs = document.getElementById('botMsgs');
  var chipsEl = document.getElementById('botChips');
  var form = document.getElementById('botForm');
  var input = document.getElementById('botInput');
  var badge = document.getElementById('botBadge');
  if (!toggle || !panel) return;

  var started = false;
  var busy = false;

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function addMsg(text, who) {
    var d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    msgs.appendChild(d);
    scrollDown();
    return d;
  }

  function addActions(actions) {
    if (!actions || !actions.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'msg-actions';
    actions.forEach(function (a) {
      var el = document.createElement('a');
      el.textContent = a.label;
      el.href = a.url;
      if (/^https?:/.test(a.url)) { el.target = '_blank'; el.rel = 'noopener'; }
      wrap.appendChild(el);
    });
    msgs.appendChild(wrap);
    scrollDown();
  }

  function setChips(list) {
    chipsEl.innerHTML = '';
    (list || []).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.addEventListener('click', function () { send(c); });
      chipsEl.appendChild(b);
    });
  }

  function typing() {
    var d = document.createElement('div');
    d.className = 'msg ai typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    msgs.appendChild(d);
    scrollDown();
    return d;
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    addMsg(text, 'user');
    input.value = '';
    var t = typing();
    var started = Date.now();
    fetch('/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var wait = Math.max(0, 550 - (Date.now() - started));
        setTimeout(function () {
          t.remove();
          addMsg(data.text || data.error || 'Ups, tente outra vez.', 'ai');
          addActions(data.actions);
          if (data.chips) setChips(data.chips);
          busy = false;
        }, wait);
      })
      .catch(function () {
        t.remove();
        addMsg('Não consegui ligar agora. Pode falar connosco pelo WhatsApp.', 'ai');
        busy = false;
      });
  }

  function open() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    if (badge) badge.classList.add('gone');
    if (!started) {
      started = true;
      addMsg('Olá! 🌙 Sou o assistente da Pastelaria Luar de Prata. Posso ajudar com a ementa do dia, horários, encomendas de bolos e muito mais.', 'ai');
      setChips(['Ementa de hoje', 'Horário', 'Como encomendar', 'Bolos de festa', 'Onde ficam?']);
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () { panel.hidden ? open() : close(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
})();
