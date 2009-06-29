var div_main_view
var div_connections
var div_target_text
var div_parent_activity
var div_activity_info
var div_send_text
var input_msg
var request
var jar = new CookieJar({expires:604800, path:"/"});
var connections = new Object()
var last_read = new Object()
var current = new Object()
current["connection_id"] = null
current["target"] = null
var last_read = new Object()
var bookmarks = new Object()

const PRIVMSG           = "p"
const ACTION            = "a"
const NOTICE            = "n"
const JOIN              = "j"
const SELF_JOIN         = "J"
const PART              = "l"
const SELF_PART         = "L"
const KICK              = "k"
const QUIT              = "q"
const TOPIC             = "t"
const NICK              = ">"
const SERVER            = "-"
const SERVER_ERROR      = "*"
const CLIENT_ERROR      = "!"
const MODE              = "m"
const CTCP              = "c"

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

function update_request() {
  var update_request = new Object()
  update_request["last_read"] = last_read
  update_request["sync"] = form_sync_object()
  request = post("update", Object.toJSON(update_request), irc_handler)
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

function channel_request(type, connection_id, channel) {
  var channel_request = new Object()
  channel_request["connection_id"] = connection_id
  channel_request["channel"] = channel
  channel_request["last_read"] = last_read
  channel_request["sync"] = form_sync_object()
  request = post(type, Object.toJSON(channel_request), irc_handler)
}

function join_request(connection_id, channel) {
  channel_request("join", connection_id, channel)
}

function part_request(connection_id, channel) {
  channel_request("part", connection_id, channel)
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

function request_to_json() {
  return request.responseText.evalJSON(true)
}

function init() {
  var stored_bookmarks = jar.get("bookmarks")
  if (stored_bookmarks) {
    bookmarks = stored_bookmarks
  }
  request = get("all", irc_handler)
  div_main_view = document.getElementById("main_view")
  div_connections = document.getElementById("connections")
  div_target_text = document.getElementById("target_text")
  div_parent_activity = document.getElementById("activity")
  div_activity_info = document.getElementById("activity_info")
  div_send_text = document.getElementById("send_text")
  input_msg = document.getElementById("msg")
  setInterval("update_request()", 15000)
}

function irc_handler(event, first_time) {
  if (request.readyState == 4 && request.status == 200) {
    var response = request_to_json()
    process_history(response.history, !first_time)
    if (response.sync) {process_sync(response.sync)}
  }
}

function create_connection_if_necessary(connection_id, element) {
  if (!connections[connection_id]) {
    create_connection_element(connection_id, element.connection_count, element.server_name, element.server_port, element.nickname, element.real_name, element.last_activity)
    return true
  } else {
    return false
  }
}

function create_connection_element(connection_id, connection_count, connection_name, connection_port, nickname, real_name, last_activity) {
  last_read[connection_id] = -1
  connections[connection_id] = new Object()
  connections[connection_id]["open_channels"] = new Array()
  connections[connection_id]["open_privmsgs"] = new Array()
  connections[connection_id]["targets"] = new Object()
  connections[connection_id]["connection_count"] = connection_count
  connections[connection_id]["server_name"] = connection_name
  connections[connection_id]["server_port"] = connection_port
  connections[connection_id]["nickname"] = nickname
  connections[connection_id]["real_name"] = real_name
  connections[connection_id]["last_activity"] = last_activity
  connections[connection_id]["target_group"] = create_div()
  connections[connection_id]["target_header"] = create_div("target_header", null, connection_name)
  connections[connection_id]["div_activity"] = create_div()
  connections[connection_id].target_group.appendChild(connections[connection_id].target_header)
  div_connections.appendChild(connections[connection_id].target_group)
}

function create_target_if_necessary(connection_id, target, is_channel) {
  if (!connections[connection_id].targets[target]) {
    create_target_element(connection_id, target, is_channel)
    return true
  } else {
    return false
  }
}

function create_target_element(connection_id, target_name, is_channel) {
  connections[connection_id].targets[target_name] = new Object()
  connections[connection_id].targets[target_name]["is_channel"] = is_channel
  connections[connection_id].targets[target_name]["div_activity"] = create_div()
  connections[connection_id].targets[target_name]["div_target"] = create_div("target")
  connections[connection_id].targets[target_name].div_target.setAttribute("onclick", "change_to(\"" + connection_id + "\", \"" + target_name + "\")")
  connections[connection_id].targets[target_name]["div_unread"] = create_div("unread_count", null, "0")
  connections[connection_id].targets[target_name].div_unread.style.display = "none"
  connections[connection_id].targets[target_name].div_target.appendChild(create_div("arrow"))
  connections[connection_id].targets[target_name].div_target.appendChild(connections[connection_id].targets[target_name].div_unread)
  if (is_channel) {
    connections[connection_id].open_channels.push(target_name)
    connections[connection_id].targets[target_name].div_target.appendChild(create_span(null, null, target_name))
  } else {
    connections[connection_id].open_privmsgs.push(target_name)
    connections[connection_id].targets[target_name].div_target.appendChild(create_span(null, null, "@" + target_name))
  }
  connections[connection_id].target_group.appendChild(connections[connection_id].targets[target_name].div_target)
}

function create_element(type, class_name, id, text) {
  var element = document.createElement(type)
  if (class_name) {element.setAttribute("class", class_name)}
  if (id) {element.setAttribute("id", id)}
  if (text) {element.textContent = text}
  return element
}

function create_div(class_name, id, text) {
  return create_element("div", class_name, id, text)
}

function create_span(class_name, id, text) {
  return create_element("span", class_name, id, text)
}

function process_history(history, auto_open) {
  for (var connection_id in history) {
    var new_target = create_connection_if_necessary(connection_id, history[connection_id])
    if (history[connection_id].connection_count != connections[connection_id].connection_count) {
      connections[connection_id].connection_count = history[connection_id].connection_count
      close_all_targets(connection_id)
    }
    for (var channel in history[connection_id].history.channels) {
      var new_target = create_target_if_necessary(connection_id, channel, true)
      connections[connection_id].targets[channel]["last_activity"] = history[connection_id].history.channels[channel].last_activity
      for (var n = 0; n < history[connection_id].history.channels[channel].data.length; n++) {
        var line = history[connection_id].history.channels[channel].data[n]
        if (check_if_new(connection_id, channel, line.msg_id)) {
          update_read_count(connection_id, line.msg_id)
          channel_log(connection_id, channel, line)
          scroll_if_necessary(connection_id, channel)
        }
      }
    }
    for (var privmsg in history[connection_id].history.privmsgs) {
      var new_target = create_target_if_necessary(connection_id, privmsg, false)
      connections[connection_id].targets[privmsg]["last_activity"] = history[connection_id].history.privmsgs[privmsg].last_activity
      for (var n = 0; n < history[connection_id].history.privmsgs[privmsg].data.length; n++) {
        var line = history[connection_id].history.privmsgs[privmsg].data[n]
        if (check_if_new(connection_id, privmsg, line.msg_id)) {
          update_read_count(connection_id, line.msg_id)
          channel_log(connection_id, privmsg, line)
          scroll_if_necessary(connection_id, privmsg)
        }
      }
    }
  }
}

function update_read_count(connection_id, msg_id) {
  if (last_read[connection_id] && msg_id > last_read[connection_id]) {
    last_read[connection_id] = msg_id
  }
}

function scroll_if_necessary(connection_id, target) {
  if (current.connection_id == connection_id && current.target == target) {
    setTimeout(scrollTo, 500, 0, document.body.scrollHeight - 416);
    div_activity_info.textContent = "Last activity: " + timestamp_long(connections[connection_id].targets[target].last_activity)
  }
}

function channel_log(connection_id, channel, line) {
  var timestamp = check_for_timestamp(connection_id, channel, line.timestamp)
  switch (line.type) {
    case JOIN:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_join(connection_id, channel, line.user, line)
    break
    case PRIVMSG:
    create_divider_if_necessary(connection_id, channel, true, timestamp)
    irc_privmsg(connection_id, channel, line.source, line.msg)
    add_unread(connection_id, channel, line.msg_id, mention_me(connection_id, line.msg))
    break
    case ACTION:
    create_divider_if_necessary(connection_id, channel, true, timestamp)
    irc_action(connection_id, channel, line.source, line.msg)
    add_unread(connection_id, channel, line.msg_id, false)
    break
    case NOTICE:
    create_divider_if_necessary(connection_id, channel, true, timestamp)
    irc_notice(connection_id, channel, line.source, line.msg)
    add_unread(connection_id, channel, line.msg_id, false)
    break
    case PART:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_part(connection_id, channel, line.source, line.msg)
    break
    case MODE:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_channel_mode(connection_id, channel, line.source, line.target, line.add_mode, line.mode_char, line.param)
    break
    case TOPIC:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_topic(connection_id, channel, line.source, line.text)
    break
    case KICK:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_kick(connection_id, channel, line.source, line.user, line.reason)
    break
    case NICK:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_nick(connection_id, channel, line.user, line.new_nickname)
    break
    case QUIT:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_quit(connection_id, channel, line.user, line.msg)
    break
  }
}

function add_unread(connection_id, target, msg_id, highlighted) {
  var div_unread = connections[connection_id].targets[target].div_unread
  if (current.connection_id == connection_id && current.target == target) {
    create_bookmark(connection_id, target, msg_id)
  } else {
    if (get_bookmark(connection_id, target) < msg_id) {
      div_unread.style.display = "block"
      div_unread.textContent = parseInt(div_unread.textContent) + 1
      if (highlighted) {
        div_unread.className = "unread_count highlighted"
      }
    }
  }
}

function create_bookmark(connection_id, target, value) {
  if (!bookmarks[connection_id]) {
    bookmarks[connection_id] = new Object()
    bookmarks[connection_id].targets = new Object()
  }
  if (target) {
    bookmarks[connection_id].targets[target] = value
  } else {
    bookmarks[connection_id]["msg_id"] = value
  }
}

function get_bookmark(connection_id, target) {
  if (!bookmarks[connection_id]) {
    return 0
  }
  if (target) {
    if (!bookmarks[connection_id].targets[target]) {
      return 0
    } else {
      return bookmarks[connection_id].targets[target]
    }
  } else {
    if (!bookmarks[connection_id].msg_id) {
      return 0
    } else {
      return bookmarks[connection_id].msg_id
    }
  }
}

function destroy_bookmarks(connection_id, target) {
  if (target) {
    if (bookmarks[connection_id] && bookmarks[connection_id].targets[target]) {
      bookmarks[connection_id].targets[target] = undefined
      jar.put("bookmarks", bookmarks)
    }
  } else {
    if (bookmarks[connection_id]) {
      bookmarks[connection_id] = undefined
      jar.put("bookmarks", bookmarks)
    }
  }
}

function mention_me(connection_id, text) {
  if (text.toLowerCase().indexOf(connections[connection_id].nickname.toLowerCase()) == 0) {
    return true
  } else {
    return false
  }
}

function add_link(text) {
  if (text.match(/^www\./i)) {
    return "<a href=\"http://" + text + "\" target=\"_blank\">" + text + "</a>"
  } else {
    return "<a href=\"" + text + "\" target=\"_blank\">" + text + "</a>"
  }
}

function linkify(element) {
  element.innerHTML = element.innerHTML.gsub(/((https?:\/\/|www\.)([A-z0-9.\/?=+-:%@()#~;$]|&amp;)+)/i, function(match){return add_link(match[1])})
  return element
}

function irc_action(connection_id, channel, user, msg) {
  var span_action = create_activity_span(nick_color(connection_id, user), " * " + user + " " + msg)
  linkify(span_action)
  add_activity(connection_id, channel, span_action)
}

function irc_notice(connection_id, channel, user, msg) {
  add_activity(connection_id, channel, create_activity_span(nick_color(connection_id, user), "[" + user + "]:", "conversation", msg))
}

function nick_color(connection_id, user) {
  return ((user == connections[connection_id].nickname) ? "nick self" : "nick")
}

function irc_join(connection_id, channel, user) {
  add_channel_narrative(connection_id, channel, user + " has joined " + channel)
}

function extra_msg(msg) {
  return (msg ? " - “" + msg + "”" : "")
}

function irc_part(connection_id, channel, user, msg) {
  add_channel_narrative(connection_id, channel, user + " has left " + channel + extra_msg(msg))
}

function irc_user_mode(connection_id, source, target, add_mode, mode_char, param) {
  irc_server_narrative(connection_id, source + " has set the mode of " + target + " to " + mode_operator(add_mode) + mode_char)
}

function irc_self_join(connection_id, channel) {
  irc_server_narrative(connection_id, "You have joined " + channel)
}

function irc_self_part(connection_id, channel, msg) {
  irc_server_narrative(connection_id, "You have left " + channel + extra_msg(msg))
}

function irc_self_kick(connection_id, user, channel, reason) {
  irc_server_narrative(connection_id, "You have been kicked from " + channel + " by " + user + extra_msg(reason))
}

function irc_nick(connection_id, channel, user, new_nickname) {
  add_channel_narrative(connection_id, channel, user + " has changed their nickname to " + new_nickname)
}

function irc_quit(connection_id, channel, user, msg) {
  add_channel_narrative(connection_id, channel, user + " has quit IRC" + extra_msg(msg))
}

function irc_kick(connection_id, channel, source, user, reason) {
  add_channel_narrative(connection_id, channel, source + " has kicked " + user + " from " + channel + extra_msg(reason))
}

function irc_topic(connection_id, channel, source, text) {
  if (text == "") {
    add_channel_narrative(connection_id, channel, source + " has cleared the current topic")
  } else {
    add_channel_narrative(connection_id, channel, source + " has set the topic to “" + text + "”")
  }
}

function add_channel_narrative(connection_id, channel, text) {
  var div_narrative = create_div("activity_element narrative small")
  div_narrative.textContent = text
  linkify(div_narrative)
  add_activity(connection_id, channel, div_narrative)
}

function op_user(connection_id, channel, source, target) {
  add_channel_narrative(connection_id, channel, source + " has given operator status to " + target)
}

function deop_user(connection_id, channel, source, target) {
  add_channel_narrative(connection_id, channel, source + " has removed operator status from " + target)
}

function voice_user(connection_id, channel, source, target) {
  add_channel_narrative(connection_id, channel, source + " has given voice status to " + target)
}

function devoice_user(connection_id, channel, source, target) {
  add_channel_narrative(connection_id, channel, source + " has removed voice status from " + target)
}

function irc_privmsg(connection_id, channel, user, msg) {
  add_activity(connection_id, channel, linkify(create_activity_span(nick_color(connection_id, user), user + ":", "conversation", msg)))
}

function create_activity_span(type_1, text_1, type_2, text_2, type_3, text_3) {
  var div_activity_element = activity_element()
  var span_text_1 = create_element("span", type_1)
  span_text_1.textContent = text_1
  div_activity_element.appendChild(span_text_1)
  if (type_2 && text_2) {
    var span_text_2 = create_element("span", type_2)
    span_text_2.textContent = text_2
    div_activity_element.appendChild(span_text_2)
  }
  if (type_3 && text_3) {
    var span_text_3 = create_element("span", type_3)
    span_text_3.textContent = text_3
    div_activity_element.appendChild(span_text_3)
  }
  return div_activity_element
}

function activity_element() {
  return create_div("activity_element")
}

function mode_operator(is_plus) {
  return (is_plus ? "+" : "-")
}

function mode_param(param) {
  return (param ? " with the value of " + param : "")
}

function irc_channel_mode(connection_id, channel, source, target, add_mode, mode_char, param) {
  switch(mode_char) {
    case "o":
    if (add_mode) {
      op_user(connection_id, channel, source, param)
    } else {
      deop_user(connection_id, channel, source, param)
    }
    break
    case "v":
    if (add_mode) {
      voice_user(connection_id, channel, source, param)
    } else {
      devoice_user(connection_id, channel, source, param)
    }
    break
    default:
    add_channel_narrative(connection_id, channel, source + " has set the mode of " + target + " to " + mode_operator(add_mode) + mode_char + mode_param(param))
  }
}

function check_for_timestamp(connection_id, target, time) {
  if (target) {
    var last_time = connections[connection_id].targets[target].last_timestamp
    connections[connection_id].targets[target].last_timestamp = time
  } else {
    var last_time = connections[connection_id].last_timestamp
    connections[connection_id]["last_timestamp"] = time
  }
  if (last_time) {
    var diff_time = time - last_time
    if (diff_time > 900) { // 15 minutes
      if (diff_time > 86400) { // 24 hours
        return add_timestamp(connection_id, target, time, true)
      } else {
        return add_timestamp(connection_id, target, time, false)
      }
    }
  } else {
    return add_timestamp(connection_id, target, time, true)
  }
  return false
}

function add_timestamp(connection_id, target, time, is_long) {
  var div_timstamp = create_div("tiny timestamp")
  if (is_long) {
    div_timstamp.textContent = timestamp_long(time)
  } else {
    div_timstamp.textContent = timestamp_short(time)
  }
  add_activity(connection_id, target, div_timstamp)
  return true
}

function div_activity(connection_id, target) {
  if (target) {
    return connections[connection_id].targets[target].div_activity
  } else {
    return connections[connection_id].div_activity
  }
}

function add_activity(connection_id, target, child) {
  div_activity(connection_id, target).appendChild(child)
}

function create_divider_if_necessary(connection_id, target, user_text, timestamp) {
 if (!timestamp && (user_text || connections[connection_id].targets[target].divider_required)) {
    div_activity(connection_id, target).appendChild(create_div("divider"))
  }
  connections[connection_id].targets[target].divider_required = user_text
}

function check_if_new(connection_id, target, check_id) {
  if (check_id > get_last_id(connection_id, target)) {
    if (target) {
      connections[connection_id].targets[target].msg_id = check_id
    } else {
      connections[connection_id].msg_id = check_id
    }
    return true
  } else {
    return false
  }
}

function get_last_id(connection_id, target) {
  if (target) {
    var last_id = connections[connection_id].targets[target].msg_id
    if (last_id) {
      return last_id
    } else {
      connections[connection_id].targets[target].msg_id = 0
      return 0
    }
  } else {
    var last_id = connections[connection_id].msg_id
    if (last_id) {
      return last_id
    } else {
      connections[connection_id].msg_id = 0
      return 0
    }
  }
}

function change_to(connection_id, target) {
  connections[connection_id].targets[target].div_target.className = "target selected"
  current.connection_id = connection_id
  current.target = target
  div_target_text.textContent = target
  div_parent_activity.appendChild(div_activity(connection_id, target))
  slide_left()
  clear_unread(connection_id, target, true)
  scroll_if_necessary(connection_id, target)
}

function clear_unread(connection_id, target, update_bookmark) {
  var div_unread = connections[connection_id].targets[target].div_unread
  div_unread.className = "unread_count"
  div_unread.style.display = "none"
  div_unread.textContent = 0
  if (update_bookmark) {
    create_bookmark(connection_id, target, last_read[connection_id])
    jar.put("bookmarks", bookmarks)
  }
}

function slide_left() {
  hide_toolbar()
  div_main_view.className = "servers_to_channels"
  div_main_view.style.left = "-320px"
}

function go_back() {
  hide_toolbar()
  div_main_view.className = "channels_to_servers"
  div_main_view.style.left = "0px"
  setTimeout("deselect_current()", 300);
  clear_input_msg()
}

function deselect_current() {
  if (connections[current.connection_id] && connections[current.connection_id].targets[current.target]) {
    connections[current.connection_id].targets[current.target].div_target.className = "target"
  }
  while(div_parent_activity.firstChild) {
    div_parent_activity.removeChild(div_parent_activity.firstChild)
  }
  current.connection_id = null
  current.target = null
}

function hide_toolbar() {
  document.body.scrollTop = 0
}

function send_msg(text) {
  if (text.indexOf("/") == 0) {
    var command = double_arg(text)
    if (command) {
      switch (command.first.toUpperCase()) {
        case "/ME":
        if (command.remainder) {
          privmsg_request(current.connection_id, current.target, command.remainder, true)
        }
        break
        case "/JOIN":
        join_request(current.connection_id, command.remainder)
        break
        case "/PART":
        part_request(current.connection_id, command.remainder)
        break
      }
    }
  } else {
    if (text != "") {
      privmsg_request(current.connection_id, current.target, text, false)
    }
  }
  clear_input_msg()
}

function double_arg(text) {
  if (text) {
    var parsed_string = text.match(/^(\S+)\s?(.*)?$/)
    if (parsed_string[1] && parsed_string[2]) {
      var out_strings = new Object()
      out_strings["first"] = parsed_string[1]
      out_strings["remainder"] = parsed_string[2]
      return out_strings
    } else {
      return null
    }
  } else {
    return null
  }
}

function key_press(event, text) {
  if (event.keyCode == 127 && text.length <= 1) {
    div_send_text.style.opacity = "0.5"
  } else {
    div_send_text.style.opacity = "1"
  }
}

function clear_input_msg() {
  input_msg.value = ""
  div_send_text.style.opacity = "0.5"
}

function close_all_targets(connection_id) {
  for (target in connections[connection_id].targets) {
    if (connections[connection_id].targets[target] && connections[connection_id].targets[target].is_channel) {
      close_channel(connection_id, target)
    } else {
      close_privmsg(connection_id, target)
    }
  }
}

function remove_target(connection_id, target) {
  if (current.connection_id == connection_id && current.target == target) {go_back()}
  if (connections[connection_id].targets[target]) {
    connections[connection_id].target_group.removeChild(connections[connection_id].targets[target]["div_target"])
    connections[connection_id].targets[target] = undefined
    destroy_bookmarks(connection_id, target)
  }
}

function close_channel(connection_id, channel) {
  connections[connection_id].open_channels.splice(connections[connection_id].open_channels.indexOf(channel), 1)
  remove_target(connection_id, channel)
}

function close_privmsg(connection_id, privmsg) {
  connections[connection_id].open_privmsgs.splice(connections[connection_id].open_privmsgs.indexOf(privmsg), 1)
  remove_target(connection_id, privmsg)
}

function close_connection(connection_id) {
  if (current.connection_id == connection_id) {go_back()}
  div_connections.removeChild(connections[connection_id].target_group)
  connections[connection_id] = undefined
  destroy_bookmarks(connection_id, null)
}

function process_sync(close) {
  for (var i = 0; i < close.connections.length; i++) {close_connection(close.connections[i])}
  for (var connection_id in close.targets) {
    for (var i = 0; i < close.targets[connection_id].channels.length; i++) {
      if (connections[connection_id]) {
        close_channel(connection_id, close.targets[connection_id].channels[i])
      }
    }
    for (var i = 0; i < close.targets[connection_id].privmsgs.length; i++) {
      if (connections[connection_id]) {
        close_privmsg(connection_id, close.targets[connection_id].privmsgs[i])
      }
    }
  }
}
