/*
 * Koe — Speech-to-text (Web Speech API, ja-JP)
 * Versión canónica compartida por todos los demos.
 *
 * Uso:
 *   Koe.listen(onResult, onListeningChange?, onEnd?)
 *   Koe.cancel()
 *   Koe.isSupported()
 *   Koe.listening  (getter)
 *
 * Características:
 *   - Fresh SpeechRecognition por cada listen()
 *   - continuous: false, interimResults: false
 *   - Watchdog de 20s — aborta si no hay resultado
 *   - Stale-recognizer guard — ignora resultados de sesiones previas
 */
;(function() {
  'use strict'

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    var _stub = { isSupported: function() { return false }, cancel: function() {}, listen: function() {}, getListening: function() { return false } }
    Object.defineProperty(_stub, 'listening', { get: _stub.getListening, enumerable: true })
    window.Koe = _stub
    return
  }

  var _listening = false
  var _onResult = null
  var _onListeningChange = null
  var _onEnd = null
  var _gotResult = false
  var _recognition = null
  var _watchdog = null

  function listen(onResult, onListeningChange, onEnd) {
    if (_listening) return
    _onResult = onResult
    _onListeningChange = onListeningChange
    _onEnd = onEnd || null
    _listening = true
    _gotResult = false
    _onListeningChange && _onListeningChange(true)

    var r = new SR()
    _recognition = r
    r.lang = 'ja-JP'
    r.continuous = false
    r.interimResults = false
    r.maxAlternatives = 5

    clearTimeout(_watchdog)
    _watchdog = setTimeout(function() {
      if (_gotResult || !_listening) return
      if (_recognition) { try { _recognition.abort() } catch (e) {} }
      if (_listening) {
        _listening = false
        _recognition = null
        _onListeningChange && _onListeningChange(false)
        _onEnd && _onEnd()
      }
    }, 20000)

    r.onresult = function(e) {
      if (_recognition !== r) return
      clearTimeout(_watchdog)
      var last = e.results[e.results.length - 1]
      var candidates = []
      for (var i = 0; i < last.length; i++) {
        candidates.push({ transcript: last[i].transcript.trim(), confidence: last[i].confidence, position: i })
      }
      _gotResult = true
      _listening = false
      _recognition = null
      _onListeningChange && _onListeningChange(false)
      _onResult && _onResult(candidates)
    }

    r.onerror = function() {
      if (_recognition !== r) return
      clearTimeout(_watchdog)
      _listening = false
      _recognition = null
      _onListeningChange && _onListeningChange(false)
    }

    r.onend = function() {
      if (_recognition !== r) return
      clearTimeout(_watchdog)
      _listening = false
      _recognition = null
      _onListeningChange && _onListeningChange(false)
      if (!_gotResult) _onEnd && _onEnd()
    }

    r.start()
  }

  function cancel() {
    clearTimeout(_watchdog)
    _listening = false
    if (_recognition) {
      try { _recognition.abort() } catch (e) {}
      _recognition = null
    }
    _onListeningChange && _onListeningChange(false)
  }

  function isSupported() { return true }
  function getListening() { return _listening }

  var koe = { listen: listen, cancel: cancel, isSupported: isSupported, getListening: getListening }
  Object.defineProperty(koe, 'listening', { get: getListening, enumerable: true })
  window.Koe = koe
})()
