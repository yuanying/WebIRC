function make_request(location, text, handler, type) {
  text = text + ""
  var request = new XMLHttpRequest()
  request.open(type, location, true)
  request.onreadystatechange = handler
  request.send(text)
  return request
}

function post(location, text, handler) {
  return make_request(location, text, handler, "POST")
}

function get(location, handler) {
  return make_request(location, "", handler, "GET")
}

function request_done() {
  if (request && request.readyState == 4 && request.status == 200) {return true} else {return false}
}

function request_to_json() {
  return request.responseText.evalJSON(true)
}

function command_request(connection_id, command, wait) {
  var command_request = new Object()
  command_request["connection_id"] = connection_id
  command_request["command"] = command
  command_request["wait"] = wait
  command_request["last_read"] = last_read
  command_request["sync"] = form_sync_object()
  request = post("command", Object.toJSON(command_request), irc_handler)
}

function join_request(connection_id, channel, key) {
  channel_request("join", connection_id, channel, key)
}

function part_request(connection_id, channel, msg) {
  channel_request("part", connection_id, channel, msg)
}

function key_request(user_name, password) {
  var key_request = new Object()
  key_request["web_user"] = user_name
  key_request["web_password"] = password
  password_request = post("password", Object.toJSON(key_request), password_handler)
}

function password_handler(event) {
  if (password_request && password_request.readyState == 4 && password_request.status == 200) {
    window.location.reload()
  }
}

function privmsg_request(connection_id, target, text, action) {
  var privmsg_request = new Object()
  privmsg_request["connection_id"] = connection_id
  privmsg_request["target"] = target
  privmsg_request["text"] = text
  privmsg_request["action"] = action
  privmsg_request["last_read"] = last_read
  privmsg_request["sync"] = form_sync_object()
  request = post("privmsg", Object.toJSON(privmsg_request), irc_handler)
}

function new_window_request(connection_id, target) {
  var new_window_request = new Object()
  new_window_request["connection_id"] = connection_id
  new_window_request["target"] = target
  new_window_request["last_read"] = last_read
  new_window_request["sync"] = form_sync_object()
  request = post("new_window", Object.toJSON(new_window_request), irc_handler)
}

function notice_request(connection_id, target, text) {
  var notice_request = new Object()
  notice_request["connection_id"] = connection_id
  notice_request["target"] = target
  notice_request["text"] = text
  notice_request["last_read"] = last_read
  notice_request["sync"] = form_sync_object()
  request = post("notice", Object.toJSON(notice_request), irc_handler)
}

function channel_request(type, connection_id, channel, param) {
  var channel_request = new Object()
  channel_request["connection_id"] = connection_id
  channel_request["channel"] = channel
  channel_request["param"] = param
  channel_request["last_read"] = last_read
  channel_request["sync"] = form_sync_object()
  request = post(type, Object.toJSON(channel_request), irc_handler)
}

function update_request() {
  var update_request = new Object()
  update_request["last_read"] = last_read
  update_request["sync"] = form_sync_object()
  request = post("update", Object.toJSON(update_request), irc_handler)
}

function close_request(connection_id, target) {
  var close_request = new Object()
  close_request["connection_id"] = connection_id
  close_request["target"] = target
  close_request["last_read"] = last_read
  close_request["sync"] = form_sync_object()
  request = post("close", Object.toJSON(close_request), irc_handler)
}

function form_sync_object() {
  var sync = new Object()
  for (var connection in connections) {
    if (connections[connection]) {
      sync[connection] = new Object()
      sync[connection]["channels"] = connections[connection].open_channels
      sync[connection]["privmsgs"] = connections[connection].open_privmsgs
    }
  }
  return sync
}

function new_connection() {
  var new_connection = new Object()
  new_connection["server_name"] = $("server_name").value
  new_connection["server_port"] = $("server_port").value
  new_connection["nickname"] = $("nickname").value
  new_connection["user_name"] = $("user_name").value
  new_connection["real_name"] = $("real_name").value
  new_connection["password"] = $("password").value
  new_connection["encoding"] = $("encoding").value
  new_connection["last_read"] = last_read
  new_connection["sync"] = form_sync_object()
  if (new_connection.server != "" && new_connection.nickname != "" &&  new_connection.username != "" && new_connection.realname != "") {
    request = post("connect", Object.toJSON(new_connection), irc_handler)
  }
}
