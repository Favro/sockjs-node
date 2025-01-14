// Generated by CoffeeScript 1.12.7
(function() {
  var FayeWebsocket, RawWebsocketSessionReceiver, Transport, WebSocketReceiver, transport, utils,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  FayeWebsocket = require('faye-websocket');

  utils = require('./utils');

  transport = require('./transport');

  exports.app = {
    _websocket_verify_origin: function(req, connection, head) {
      if (!req.headers['origin']) {
        return false;
      }
      return this.options.verify_origin(req.headers['origin']);
    },
    _websocket_check: function(req, connection, head) {
      if (this.options.verify_origin) {
        if (!this._websocket_verify_origin(req, connection, head)) {
          throw {
            status: 403,
            message: 'Origin does not match'
          };
        }
      }
      if (!FayeWebsocket.isWebSocket(req)) {
        throw {
          status: 400,
          message: 'Not a valid websocket request'
        };
      }
    },
    sockjs_websocket: function(req, connection, head) {
      var ws;
      this._websocket_check(req, connection, head);
      ws = new FayeWebsocket(req, connection, head, null, this.options.faye_server_options);
      ws.onopen = (function(_this) {
        return function() {
          return transport.registerNoSession(req, _this, new WebSocketReceiver(ws, connection));
        };
      })(this);
      return true;
    },
    raw_websocket: function(req, connection, head) {
      var ver, ws;
      this._websocket_check(req, connection, head);
      ver = req.headers['sec-websocket-version'] || '';
      if (['8', '13'].indexOf(ver) === -1) {
        throw {
          status: 400,
          message: 'Only supported WebSocket protocol is RFC 6455.'
        };
      }
      ws = new FayeWebsocket(req, connection, head, null, this.options.faye_server_options);
      ws.onopen = (function(_this) {
        return function() {
          return new RawWebsocketSessionReceiver(req, connection, _this, ws);
        };
      })(this);
      return true;
    }
  };

  WebSocketReceiver = (function(superClass) {
    extend(WebSocketReceiver, superClass);

    WebSocketReceiver.prototype.protocol = "websocket";

    function WebSocketReceiver(ws1, connection1) {
      var x;
      this.ws = ws1;
      this.connection = connection1;
      try {
        this.connection.setKeepAlive(true, 5000);
        this.connection.setNoDelay(true);
      } catch (error) {
        x = error;
      }
      this.ws.addEventListener('message', (function(_this) {
        return function(m) {
          return _this.didMessage(m.data);
        };
      })(this));
      this.heartbeat_cb = (function(_this) {
        return function() {
          return _this.heartbeat_timeout();
        };
      })(this);
      WebSocketReceiver.__super__.constructor.call(this, this.connection);
    }

    WebSocketReceiver.prototype.setUp = function() {
      WebSocketReceiver.__super__.setUp.apply(this, arguments);
      return this.ws.addEventListener('close', this.thingy_end_cb);
    };

    WebSocketReceiver.prototype.tearDown = function() {
      this.ws.removeEventListener('close', this.thingy_end_cb);
      return WebSocketReceiver.__super__.tearDown.apply(this, arguments);
    };

    WebSocketReceiver.prototype.didMessage = function(payload) {
      var i, len, message, msg, results, x;
      if (this.ws && this.session && payload.length > 0) {
        try {
          message = JSON.parse(payload);
        } catch (error) {
          x = error;
          return this.didClose(3000, 'Broken framing.');
        }
        if (payload[0] === '[') {
          results = [];
          for (i = 0, len = message.length; i < len; i++) {
            msg = message[i];
            results.push(this.session.didMessage(msg));
          }
          return results;
        } else {
          return this.session.didMessage(message);
        }
      }
    };

    WebSocketReceiver.prototype.doSendFrame = function(payload) {
      var x;
      if (this.ws) {
        try {
          this.ws.send(payload);
          return true;
        } catch (error) {
          x = error;
        }
      }
      return false;
    };

    WebSocketReceiver.prototype.didClose = function(status, reason) {
      var x;
      if (status == null) {
        status = 1000;
      }
      if (reason == null) {
        reason = "Normal closure";
      }
      WebSocketReceiver.__super__.didClose.apply(this, arguments);
      try {
        this.ws.close(status, reason, false);
      } catch (error) {
        x = error;
      }
      this.ws = null;
      return this.connection = null;
    };

    WebSocketReceiver.prototype.heartbeat = function() {
      var hto_ref, supportsHeartbeats;
      supportsHeartbeats = this.ws.ping(null, function() {
        return clearTimeout(hto_ref);
      });
      if (supportsHeartbeats) {
        return hto_ref = setTimeout(this.heartbeat_cb, 10000);
      } else {
        return WebSocketReceiver.__super__.heartbeat.apply(this, arguments);
      }
    };

    WebSocketReceiver.prototype.heartbeat_timeout = function() {
      if (this.session != null) {
        return this.session.close(3000, 'No response from heartbeat');
      }
    };

    return WebSocketReceiver;

  })(transport.GenericReceiver);

  Transport = transport.Transport;

  RawWebsocketSessionReceiver = (function(superClass) {
    extend(RawWebsocketSessionReceiver, superClass);

    function RawWebsocketSessionReceiver(req, conn, server, ws1) {
      this.ws = ws1;
      this.prefix = server.options.prefix;
      this.readyState = Transport.OPEN;
      this.recv = {
        connection: conn,
        protocol: "websocket-raw"
      };
      this.connection = new transport.SockJSConnection(this);
      this.decorateConnection(req);
      server.emit('connection', this.connection);
      this._end_cb = (function(_this) {
        return function() {
          return _this.didClose();
        };
      })(this);
      this.ws.addEventListener('close', this._end_cb);
      this._message_cb = (function(_this) {
        return function(m) {
          return _this.didMessage(m);
        };
      })(this);
      this.ws.addEventListener('message', this._message_cb);
    }

    RawWebsocketSessionReceiver.prototype.didMessage = function(m) {
      if (this.readyState === Transport.OPEN) {
        this.connection.emit('data', m.data);
      }
    };

    RawWebsocketSessionReceiver.prototype.send = function(payload) {
      if (this.readyState !== Transport.OPEN) {
        return false;
      }
      this.ws.send(payload);
      return true;
    };

    RawWebsocketSessionReceiver.prototype.close = function(status, reason) {
      if (status == null) {
        status = 1000;
      }
      if (reason == null) {
        reason = "Normal closure";
      }
      if (this.readyState !== Transport.OPEN) {
        return false;
      }
      this.readyState = Transport.CLOSING;
      this.ws.close(status, reason, false);
      return true;
    };

    RawWebsocketSessionReceiver.prototype.didClose = function() {
      var x;
      if (!this.ws) {
        return;
      }
      this.ws.removeEventListener('message', this._message_cb);
      this.ws.removeEventListener('close', this._end_cb);
      try {
        this.ws.close(1000, "Normal closure", false);
      } catch (error) {
        x = error;
      }
      this.ws = null;
      this.readyState = Transport.CLOSED;
      this.connection.emit('end');
      this.connection.emit('close');
      return this.connection = null;
    };

    return RawWebsocketSessionReceiver;

  })(transport.Session);

}).call(this);
