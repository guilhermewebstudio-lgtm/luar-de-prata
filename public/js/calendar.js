(function () {
  var raw = document.getElementById('calData');
  var panel = document.getElementById('calPanel');
  if (!raw || !panel) return;
  var D = JSON.parse(raw.textContent);
  var months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var weekdays = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function waPhone(p) {
    var n = String(p).replace(/\D/g, '');
    return n.length === 9 ? '351' + n : n;
  }
  function hidden(name, value) {
    var i = document.createElement('input');
    i.type = 'hidden'; i.name = name; i.value = value;
    return i;
  }

  function render(date) {
    var parts = date.split('-').map(Number);
    var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    panel.innerHTML = '';
    panel.appendChild(el('h2', null, weekdays[dt.getUTCDay()] + ', ' + parts[2] + ' de ' + months[parts[1] - 1]));
    var list = D.orders[date] || [];
    if (!list.length) {
      panel.appendChild(el('p', 'muted', 'Sem encomendas para este dia.'));
      return;
    }
    list.forEach(function (o) {
      var card = el('div', 'cal-order st-' + o.status);
      var top = el('div', 'co-top');
      top.appendChild(el('strong', null, '#' + o.id + ' · ' + o.name));
      top.appendChild(el('span', 'badge st-' + o.status, o.status));
      card.appendChild(top);
      card.appendChild(el('div', 'muted', o.kind + (o.pickup_time ? ' · às ' + o.pickup_time : '')));
      card.appendChild(el('p', 'details', o.details));
      var contact = el('div', 'co-contact');
      var tel = el('a', null, o.phone); tel.href = 'tel:' + o.phone;
      var wa = el('a', null, 'WhatsApp'); wa.href = 'https://wa.me/' + waPhone(o.phone); wa.target = '_blank'; wa.rel = 'noopener';
      contact.appendChild(tel); contact.appendChild(document.createTextNode(' · ')); contact.appendChild(wa);
      card.appendChild(contact);
      var form = document.createElement('form');
      form.method = 'post'; form.action = '/admin/encomendas/' + o.id + '/estado';
      form.appendChild(hidden('_csrf', D.csrf));
      form.appendChild(hidden('back', location.pathname + location.search));
      var sel = document.createElement('select');
      sel.name = 'status';
      D.statuses.forEach(function (s) {
        var op = document.createElement('option');
        op.value = s; op.textContent = s; if (s === o.status) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { form.submit(); });
      form.appendChild(sel);
      card.appendChild(form);
      panel.appendChild(card);
    });
  }

  var days = document.querySelectorAll('.cal-day');
  function select(date) {
    days.forEach(function (d) { d.classList.toggle('sel', d.getAttribute('data-date') === date); });
    try {
      var u = new URL(location.href);
      u.searchParams.set('dia', date);
      history.replaceState(null, '', u.toString());
    } catch (e) {}
    render(date);
  }
  days.forEach(function (d) {
    d.addEventListener('click', function () { select(d.getAttribute('data-date')); });
  });
  render(D.selected);
})();
