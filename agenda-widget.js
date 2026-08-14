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
 * do funil). Aqui é um toque no horário e pronto — mas com uma etapa de
 * confirmação explícita entre "toquei" e "está marcado", para quem errou o dedo.
 *
 * Uso:
 *   AgendaWidget.montar({
 *     alvo:      document.getElementById('agendaInline'),
 *     frente:    'acelerago',            // ou 'detoni'
 *     cor:       '#f97316',
 *     dados:     () => ({ nome, email, telefone, observacoes }),
 *     aoMarcar:  (resultado) => { ... },  // sucesso: dispara pixel, CAPI etc.
 *     aoFalhar:  () => { ... },           // mostra o caminho do WhatsApp
 *   })
 */
;(function (global) {
  'use strict'

  var css = [
    '.ag-wrap{font-family:inherit;text-align:left;border:1.5px solid #e8e6e1;border-radius:18px;padding:22px 20px;background:#fff;box-shadow:0 2px 10px rgba(17,17,17,.05);box-sizing:border-box}',
    '.ag-wrap *{box-sizing:border-box}',

    '.ag-email{margin:0 0 18px}',
    '.ag-email label{display:block;font-size:.88rem;color:#374151;font-weight:600;margin-bottom:7px}',
    '.ag-email input{width:100%;padding:13px 14px;border:1.5px solid #e5e7eb;border-radius:11px;font-size:1rem;font-family:inherit;background:#fafafa;transition:border-color .15s,background .15s}',
    '.ag-email input:focus{outline:none;border-color:var(--ag-cor);background:#fff}',
    '.ag-email .ag-campo-erro{display:none;font-size:.85rem;color:#b91c1c;margin:6px 0 0}',

    '.ag-secao-label{font-size:.8rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin:0 0 10px}',

    '.ag-dias-wrap{position:relative;margin-bottom:18px}',
    '.ag-dias-wrap::after{content:"";position:absolute;top:0;right:0;bottom:6px;width:34px;background:linear-gradient(to right, rgba(255,255,255,0), #fff 75%);pointer-events:none;transition:opacity .15s}',
    '.ag-dias-wrap.ag-dias-fim::after{opacity:0}',
    '.ag-dias{display:flex;gap:8px;overflow-x:auto;padding:2px 30px 4px 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none}',
    '.ag-dias::-webkit-scrollbar{display:none}',
    '.ag-dia{flex:0 0 auto;min-width:64px;padding:10px 8px;border:1.5px solid #ececea;border-radius:13px;background:#fff;cursor:pointer;text-align:center;line-height:1.2;transition:border-color .15s,background .15s,transform .1s}',
    '.ag-dia:hover{border-color:var(--ag-cor)}',
    '.ag-dia:active{transform:scale(.96)}',
    '.ag-dia small{display:block;font-size:.7rem;color:#9ca3af;text-transform:capitalize;font-weight:600}',
    '.ag-dia b{display:block;font-size:1.15rem;color:#111;margin-top:3px;font-weight:700}',
    '.ag-dia.on{border-color:var(--ag-cor);background:var(--ag-tint)}',
    '.ag-dia.on b, .ag-dia.on small{color:var(--ag-cor)}',

    '.ag-horas{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:9px}',
    '.ag-hora{padding:13px 6px;border:1.5px solid #ececea;border-radius:11px;background:#fff;font-size:.98rem;font-weight:600;color:#1f2937;cursor:pointer;transition:border-color .15s,background .15s,transform .1s}',
    '.ag-hora:hover{border-color:var(--ag-cor);background:var(--ag-tint)}',
    '.ag-hora:active{transform:scale(.96)}',

    '.ag-rodape{padding-top:14px;color:#9ca3af;font-size:.85rem;line-height:1.5;text-align:center}',

    '.ag-msg{padding:14px 0;color:#6b7280;font-size:.95rem;line-height:1.5}',
    '.ag-erro{color:#b91c1c}',

    /* etapa de confirmação */
    '.ag-confirma{text-align:center;padding:6px 0 2px}',
    '.ag-confirma .ag-icone{width:46px;height:46px;border-radius:50%;background:var(--ag-tint);color:var(--ag-cor);display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 16px}',
    '.ag-confirma p.ag-pergunta{font-size:.95rem;color:#6b7280;margin:0 0 6px}',
    '.ag-confirma .ag-quando{font-size:1.22rem;font-weight:800;color:#111;text-transform:capitalize;line-height:1.35;margin:0 0 4px}',
    '.ag-confirma .ag-duracao{font-size:.88rem;color:#9ca3af;margin:0 0 22px}',
    '.ag-btn{display:block;width:100%;padding:15px 24px;background:var(--ag-cor);color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:1rem;border:0;cursor:pointer;transition:opacity .15s,transform .1s}',
    '.ag-btn:hover{opacity:.92}',
    '.ag-btn:active{transform:scale(.985)}',
    '.ag-btn:disabled{opacity:.6;cursor:default}',
    '.ag-btn-voltar{display:block;width:100%;text-align:center;margin-top:10px;padding:12px;background:transparent;color:#6b7280;border:0;font-size:.92rem;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px}',

    '.ag-ok{text-align:center;padding:8px 0}',
    '.ag-ok .ag-check{width:52px;height:52px;border-radius:50%;background:var(--ag-tint);color:var(--ag-cor);display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 14px}',
    '.ag-ok h3{font-size:1.2rem;margin:0 0 6px;color:#111}',
    '.ag-ok .ag-quando{font-size:1.05rem;font-weight:700;color:var(--ag-cor);text-transform:capitalize;margin:0 0 4px}',
    '.ag-ok p{color:#6b7280;font-size:.92rem;line-height:1.55;margin:0 0 6px}',

    '.ag-spin{width:24px;height:24px;border:2.5px solid #e5e7eb;border-top-color:var(--ag-cor);border-radius:50%;animation:ag-gira .7s linear infinite;margin:20px auto}',
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

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function montar(opts) {
    injetarCss()
    var alvo = opts.alvo
    if (!alvo) return

    alvo.style.setProperty('--ag-cor', opts.cor || '#f97316')
    alvo.style.setProperty('--ag-tint', (opts.tint || 'rgba(0,0,0,.05)'))
    alvo.className = 'ag-wrap ' + (alvo.className || '')
    alvo.innerHTML = '<div class="ag-spin"></div>'

    // etapa: 'carregando' | 'escolha' | 'confirmando' | 'enviando' | 'erro'
    var estado = { slots: [], diaAtivo: null, etapa: 'carregando', email: null, escolhido: null }

    function falhou(msg) {
      estado.etapa = 'erro'
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
        estado.etapa = 'escolha'
        render()
      })
      .catch(function () {
        falhou('Não consegui carregar os horários agora. Fale com a gente pelo WhatsApp logo abaixo.')
      })

    function render() {
      if (estado.etapa === 'confirmando') return renderConfirmacao()
      renderEscolha()
    }

    function renderEscolha() {
      var dias = []
      estado.slots.forEach(function (s) { if (dias.indexOf(s.dia) < 0) dias.push(s.dia) })

      // Funil que não coletou email pede aqui — é onde o Calendly pedia também,
      // no ponto de maior intenção, e sem tirar a pessoa da página.
      var html = opts.pedirEmail
        ? '<div class="ag-email"><label for="agEmail">Para onde enviamos a confirmação?</label>' +
          '<input id="agEmail" type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com.br" value="' +
          esc(estado.email || (opts.dados && opts.dados().email) || '') + '">' +
          '<p class="ag-campo-erro" id="agEmailErro">Informe um email válido, ex: nome@empresa.com.br</p></div>'
        : ''

      html += '<p class="ag-secao-label">Escolha o dia</p><div class="ag-dias-wrap"><div class="ag-dias">'
      dias.forEach(function (d) {
        var r = rotuloDia(d)
        html += '<button type="button" class="ag-dia' + (d === estado.diaAtivo ? ' on' : '') +
                '" data-dia="' + d + '"><small>' + r.semana + '</small><b>' + r.dia + '</b></button>'
      })
      html += '</div></div><p class="ag-secao-label">Escolha o horário</p><div class="ag-horas">'
      estado.slots.filter(function (s) { return s.dia === estado.diaAtivo }).forEach(function (s) {
        html += '<button type="button" class="ag-hora" data-inicio="' + s.inicio + '">' + hhmm(s.inicio) + '</button>'
      })
      html += '</div><p class="ag-rodape">Reunião de ' + estado.duracao + ' minutos, por videochamada. Horário de Brasília.</p>'
      alvo.innerHTML = html

      alvo.querySelectorAll('.ag-dia').forEach(function (b) {
        b.onclick = function () { estado.diaAtivo = b.getAttribute('data-dia'); render() }
      })
      alvo.querySelectorAll('.ag-hora').forEach(function (b) {
        b.onclick = function () { escolherHorario(b.getAttribute('data-inicio')) }
      })

      // Some com a sombra quando não há mais o que rolar — ela só faz sentido
      // como aviso de "tem mais dias pra cá", não como decoração fixa.
      var trilho = alvo.querySelector('.ag-dias')
      var faixa = alvo.querySelector('.ag-dias-wrap')
      if (trilho && faixa) {
        var atualizarFade = function () {
          var fim = trilho.scrollLeft + trilho.clientWidth >= trilho.scrollWidth - 4
          faixa.classList.toggle('ag-dias-fim', fim)
        }
        trilho.addEventListener('scroll', atualizarFade)
        atualizarFade()
      }
    }

    function escolherHorario(inicio) {
      // Email pedido na própria tela: valida antes de avançar pra confirmação.
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
        estado.email = v
      }
      var slot = estado.slots.filter(function (s) { return s.inicio === inicio })[0]
      if (!slot) return
      estado.escolhido = slot
      estado.etapa = 'confirmando'
      render()
    }

    function renderConfirmacao() {
      var s = estado.escolhido
      alvo.innerHTML =
        '<div class="ag-confirma">' +
          '<div class="ag-icone">🗓️</div>' +
          '<p class="ag-pergunta">Confirma este horário?</p>' +
          '<p class="ag-quando">' + s.rotulo + '</p>' +
          '<p class="ag-duracao">' + estado.duracao + ' minutos · videochamada</p>' +
          '<button type="button" class="ag-btn" id="agConfirmar">Confirmar agendamento</button>' +
          '<button type="button" class="ag-btn-voltar" id="agVoltar">← Escolher outro horário</button>' +
        '</div>'
      alvo.querySelector('#agConfirmar').onclick = marcar
      alvo.querySelector('#agVoltar').onclick = function () {
        estado.etapa = 'escolha'
        estado.escolhido = null
        render()
      }
    }

    function marcar() {
      if (estado.etapa === 'enviando') return
      estado.etapa = 'enviando'
      var btn = alvo.querySelector('#agConfirmar')
      if (btn) { btn.disabled = true; btn.textContent = 'Confirmando…' }
      var voltar = alvo.querySelector('#agVoltar')
      if (voltar) voltar.style.display = 'none'

      var d = opts.dados ? opts.dados() : {}
      if (estado.email) d.email = estado.email

      // Mesmo endpoint que o Calendly acionava (api/agendamento.js): ele já faz
      // Telegram, alerta no grupo, Meta CAPI e move o card no Kanban. Agora ele
      // marca a reunião de verdade em vez de só registrar o que o Calendly fez.
      fetch('/api/agendamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Espalha TUDO o que o funil quis mandar (instagram, site, faturamento,
        // fbc/fbp…): o endpoint usa esses campos no alerta do grupo e na CAPI.
        body: JSON.stringify(Object.assign({}, d, { inicio: estado.escolhido.inicio, frente: opts.frente })),
      })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j } }) })
        .then(function (res) {
          if (res.status === 409) {
            // Alguém pegou o horário no meio do caminho. Recarrega a lista em vez
            // de deixar a pessoa confirmando um horário que não existe mais.
            estado.etapa = 'escolha'
            estado.escolhido = null
            alvo.innerHTML = '<p class="ag-msg ag-erro">Esse horário acabou de ser ocupado. Escolha outro:</p><div class="ag-spin"></div>'
            return fetch('/api/horarios?frente=' + encodeURIComponent(opts.frente))
              .then(function (r) { return r.json() })
              .then(function (j) { estado.slots = j.slots || []; estado.diaAtivo = (estado.slots[0] || {}).dia; render() })
          }
          if (!res.j || !res.j.ok) throw new Error(res.j && res.j.error || 'falha')
          res.j.email = estado.email || null
          sucesso(res.j)
          if (opts.aoMarcar) try { opts.aoMarcar(res.j) } catch (e) {}
        })
        .catch(function () {
          estado.etapa = 'confirmando'
          render()
          falhouConfirmar()
        })
    }

    function falhouConfirmar() {
      var box = document.createElement('p')
      box.className = 'ag-msg ag-erro'
      box.textContent = 'Não consegui confirmar o horário. Fale com a gente pelo WhatsApp logo abaixo.'
      alvo.insertBefore(box, alvo.firstChild)
      if (opts.aoFalhar) try { opts.aoFalhar() } catch (e) {}
    }

    function sucesso(r) {
      var html = '<div class="ag-ok"><div class="ag-check">✓</div>' +
        '<h3>Está marcado</h3>' +
        '<p class="ag-quando">' + r.quando + '</p>' +
        '<p>' + (r.emailEnviado
          ? 'A confirmação e o link da chamada foram para o seu e-mail.'
          : 'Anote o link da chamada abaixo — ele também vai para o seu WhatsApp.') + '</p>'
      if (r.linkZoom) {
        html += '<a class="ag-btn" href="' + r.linkZoom + '" target="_blank" rel="noopener" style="text-decoration:none">Abrir o link da reunião</a>'
      }
      html += '</div>'
      alvo.innerHTML = html
    }
  }

  global.AgendaWidget = { montar: montar }
})(window)
