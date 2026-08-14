/**
 * Widget de agendamento próprio — substitui o iframe do Calendly nos dois funis.
 *
 * Este arquivo é a FONTE. Ele é copiado para os repos dos funis
 * (aceleraGO-site e detoni-funil) — não é carregado de fora, porque o funil
 * não pode depender da disponibilidade de outro domínio bem no passo da conversão.
 * Ao mexer aqui, copiar para os dois. Ver AGENDA.md.
 *
 * Ganho sobre o Calendly: o funil JÁ SABE nome, email e telefone. O Calendly
 * pedia tudo de novo (dois formulários para a mesma pessoa, no passo mais caro
 * do funil). Aqui é um toque no horário e pronto.
 *
 * Uso:
 *   AgendaWidget.montar({
 *     alvo:      document.getElementById('agendaInline'),
 *     frente:    'acelerago',            // ou 'detoni'
 *     cor:       '#f97316',
 *     dados:     () => ({ nome, email, telefone, ...resto }),  // vai inteiro no POST
 *     aoMarcar:  (resultado) => { ... },  // sucesso: dispara pixel, CAPI etc.
 *     aoFalhar:  () => { ... },           // mostra o caminho do WhatsApp
 *   })
 */
;(function (global) {
  'use strict'

  var css = [
    '.ag-wrap{font-family:inherit;text-align:left}',
    '.ag-dias{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 12px;-webkit-overflow-scrolling:touch;scrollbar-width:none}',
    '.ag-dias::-webkit-scrollbar{display:none}',
    '.ag-dia{flex:0 0 auto;min-width:76px;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:12px;background:#fff;cursor:pointer;text-align:center;line-height:1.25;transition:border-color .15s,background .15s}',
    '.ag-dia small{display:block;font-size:.72rem;color:#6b7280;text-transform:capitalize}',
    '.ag-dia b{display:block;font-size:1.05rem;color:#111;margin-top:2px}',
    '.ag-dia.on{border-color:var(--ag-cor);background:var(--ag-tint)}',
    '.ag-dia.on b{color:var(--ag-cor)}',
    '.ag-horas{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}',
    '.ag-hora{padding:12px 6px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;font-size:1rem;font-weight:600;color:#111;cursor:pointer;transition:border-color .15s,background .15s}',
    '.ag-hora:hover{border-color:var(--ag-cor)}',
    '.ag-hora:disabled{opacity:.5;cursor:default}',
    '.ag-hora.on{border-color:var(--ag-cor);background:var(--ag-cor);color:#fff}',
    '.ag-msg{padding:14px 0;color:#6b7280;font-size:.95rem;line-height:1.5}',
    '.ag-erro{color:#b91c1c}',
    '.ag-email{margin:0 0 14px}',
    '.ag-email label{display:block;font-size:.9rem;color:#374151;font-weight:600;margin-bottom:6px}',
    '.ag-email input{width:100%;padding:13px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:1rem;font-family:inherit;box-sizing:border-box}',
    '.ag-email input:focus{outline:none;border-color:var(--ag-cor)}',
    '.ag-email .ag-erro{display:none;font-size:.85rem;margin:6px 0 0}',
    '.ag-ok{text-align:center;padding:8px 0}',
    '.ag-ok .ag-check{width:52px;height:52px;border-radius:50%;background:var(--ag-tint);color:var(--ag-cor);display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 14px}',
    '.ag-ok h3{font-size:1.2rem;margin:0 0 6px;color:#111}',
    '.ag-ok .ag-quando{font-size:1.05rem;font-weight:700;color:var(--ag-cor);text-transform:capitalize;margin:0 0 4px}',
    '.ag-ok p{color:#6b7280;font-size:.92rem;line-height:1.55;margin:0 0 6px}',
    '.ag-btn{display:inline-block;margin-top:14px;padding:13px 26px;background:var(--ag-cor);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:.98rem;border:0;cursor:pointer}',
    '.ag-spin{width:22px;height:22px;border:2.5px solid #e5e7eb;border-top-color:var(--ag-cor);border-radius:50%;animation:ag-gira .7s linear infinite;margin:18px auto}',
    '@keyframes ag-gira{to{transform:rotate(360deg)}}',
  ].join('')

  function injetarCss() {
    if (document.getElementById('ag-css')) return
    var s = document.createElement('style')
    s.id = 'ag-css'
    s.textContent = css
    document.head.appendChild(s)
  }

  /** "2026-08-14" → {semana:"qui", dia:"14"} — sem depender de Date parse local. */
  function rotuloDia(iso) {
    var p = iso.split('-')
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
    var semana = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
    return { semana: semana, dia: p[2] }
  }

  /** "14:30" a partir do ISO UTC, no fuso de São Paulo. */
  function hhmm(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    })
  }

  function montar(opts) {
    injetarCss()
    var alvo = opts.alvo
    if (!alvo) return

    alvo.style.setProperty('--ag-cor', opts.cor || '#f97316')
    alvo.style.setProperty('--ag-tint', (opts.tint || 'rgba(0,0,0,.05)'))
    alvo.className = 'ag-wrap ' + (alvo.className || '')
    alvo.innerHTML = '<div class="ag-spin"></div>'

    var estado = { slots: [], diaAtivo: null, marcando: false, email: null }

    function falhou(msg) {
      alvo.innerHTML = '<p class="ag-msg ag-erro">' + msg + '</p>'
      if (opts.aoFalhar) try { opts.aoFalhar() } catch (e) {}
    }

    fetch('/api/horarios?frente=' + encodeURIComponent(opts.frente))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)) })
      .then(function (j) {
        if (!j.ok || !j.slots || !j.slots.length) {
          return falhou('Não consegui carregar os horários agora. Fale com a gente pelo WhatsApp logo abaixo.')
        }
        estado.slots = j.slots
        estado.duracao = j.duracaoMin
        estado.diaAtivo = j.slots[0].dia
        render()
      })
      .catch(function () {
        falhou('Não consegui carregar os horários agora. Fale com a gente pelo WhatsApp logo abaixo.')
      })

    function render() {
      var dias = []
      estado.slots.forEach(function (s) { if (dias.indexOf(s.dia) < 0) dias.push(s.dia) })

      // Funil que não coletou email pede aqui — é onde o Calendly pedia também,
      // no ponto de maior intenção, e sem tirar a pessoa da página.
      var html = opts.pedirEmail
        ? '<div class="ag-email"><label for="agEmail">Para onde enviamos a confirmação?</label>' +
          '<input id="agEmail" type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com.br" value="' +
          (estado.email || (opts.dados && opts.dados().email) || '') + '">' +
          '<p class="ag-erro" id="agEmailErro">Informe um email válido, ex: nome@empresa.com.br</p></div>'
        : ''

      html += '<div class="ag-dias">'
      dias.forEach(function (d) {
        var r = rotuloDia(d)
        html += '<button type="button" class="ag-dia' + (d === estado.diaAtivo ? ' on' : '') +
                '" data-dia="' + d + '"><small>' + r.semana + '</small><b>' + r.dia + '</b></button>'
      })
      html += '</div><div class="ag-horas">'
      estado.slots.filter(function (s) { return s.dia === estado.diaAtivo }).forEach(function (s) {
        html += '<button type="button" class="ag-hora" data-inicio="' + s.inicio + '">' + hhmm(s.inicio) + '</button>'
      })
      html += '</div><p class="ag-msg">Reunião de ' + estado.duracao + ' minutos, por videochamada. Horário de Brasília.</p>'
      alvo.innerHTML = html

      alvo.querySelectorAll('.ag-dia').forEach(function (b) {
        b.onclick = function () { estado.diaAtivo = b.getAttribute('data-dia'); render() }
      })
      alvo.querySelectorAll('.ag-hora').forEach(function (b) {
        b.onclick = function () { marcar(b) }
      })
    }

    function marcar(botao) {
      if (estado.marcando) return
      var inicio = botao.getAttribute('data-inicio')
      var d = opts.dados ? opts.dados() : {}

      // Email pedido na própria tela: valida antes de queimar o horário.
      var campo = alvo.querySelector('#agEmail')
      if (campo) {
        var v = campo.value.trim()
        var erro = alvo.querySelector('#agEmailErro')
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) {
          if (erro) erro.style.display = 'block'
          campo.focus()
          return
        }
        if (erro) erro.style.display = 'none'
        // Guarda para o re-render do 409 não apagar o que ela já digitou.
        estado.email = v
        d.email = v
      }

      estado.marcando = true
      botao.classList.add('on')
      alvo.querySelectorAll('.ag-hora').forEach(function (b) { b.disabled = true })

      // Mesmo endpoint que o Calendly acionava (api/agendamento.js): ele já faz
      // Telegram, alerta no grupo, Meta CAPI e move o card no Kanban. Agora ele
      // marca a reunião de verdade em vez de só registrar o que o Calendly fez.
      fetch('/api/agendamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Espalha TUDO o que o funil quis mandar (instagram, site, faturamento,
        // fbc/fbp…): o endpoint usa esses campos no alerta do grupo e na CAPI.
        body: JSON.stringify(Object.assign({}, d, { inicio: inicio, frente: opts.frente })),
      })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j } }) })
        .then(function (res) {
          estado.marcando = false
          if (res.status === 409) {
            // Alguém pegou o horário no meio do caminho. Recarrega a lista em vez
            // de deixar a pessoa batendo num horário que não existe mais.
            alvo.innerHTML = '<p class="ag-msg ag-erro">Esse horário acabou de ser ocupado. Escolha outro:</p><div class="ag-spin"></div>'
            return fetch('/api/horarios?frente=' + encodeURIComponent(opts.frente))
              .then(function (r) { return r.json() })
              .then(function (j) { estado.slots = j.slots || []; estado.diaAtivo = (estado.slots[0] || {}).dia; render() })
          }
          if (!res.j || !res.j.ok) throw new Error(res.j && res.j.error || 'falha')
          sucesso(res.j)
          // Devolve o email de volta: o funil que perguntou aqui não o tinha antes.
          res.j.email = d.email || null
          if (opts.aoMarcar) try { opts.aoMarcar(res.j) } catch (e) {}
        })
        .catch(function () {
          estado.marcando = false
          falhou('Não consegui confirmar o horário. Fale com a gente pelo WhatsApp logo abaixo.')
        })
    }

    function sucesso(r) {
      var html = '<div class="ag-ok"><div class="ag-check">✓</div>' +
        '<h3>Está marcado</h3>' +
        '<p class="ag-quando">' + r.quando + '</p>' +
        '<p>' + (r.emailEnviado
          ? 'A confirmação e o link da chamada foram para o seu e-mail.'
          : 'Anote o link da chamada abaixo — ele também vai para o seu WhatsApp.') + '</p>'
      if (r.linkZoom) {
        html += '<a class="ag-btn" href="' + r.linkZoom + '" target="_blank" rel="noopener">Abrir o link da reunião</a>'
      }
      html += '</div>'
      alvo.innerHTML = html
    }
  }

  global.AgendaWidget = { montar: montar }
})(window)
