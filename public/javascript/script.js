var request
var connections = new Object()
var last_read = new Object()
var current = new Object()
var bookmarks = new Object()
var jar = new CookieJar({expires:10080, path:"/"});
var input_history = new Object()
input_history["data"] = new Array()
input_history["position"] = -1
var tab_completion = new Object()
tab_completion["repeat"] = false
tab_completion["search_term"] = null
tab_completion["user_lookup"] = new Array()
tab_completion["response"] = false
tab_completion["last_match"] = 0

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

window.onresize = function() {
  update_activity_width()
}

function update_activity_width() {
  if (current.target && connections[current.connection_id].targets[current.target].is_channel) {
    $("activity").style.width = document.body.offsetWidth - 417 + "px"
  } else {
    $("activity").style.width = document.body.offsetWidth - 247 + "px"
  }
}

function init() {
  var stored_bookmarks = jar.get("bookmarks")
  if (stored_bookmarks) {
    bookmarks = stored_bookmarks
  }
  hide("users")
  request = get("all", first_time_irc_handler)
  $("server_name").focus()
  setInterval("update_request()", 10000)
  update_activity_width()
}

function send_msg(text) {
  input_history.data[input_history.data.length] = text
  input_history.position = input_history.data.length
  if (text.indexOf("/") == 0) {
    var command = double_arg(text)
    if (command) {
      input_command(command.first.toUpperCase(), command.remainder)
    } else {
      if (current.connection_id) {
        switch (text.toUpperCase()) {
          case "/PART":
          if (current.target) {
            part_request(current.connection_id, current.target)
          }
          break
          case "/QUIT":
          close_request(current.connection_id, null)
          break
          case "/CLOSE":
          if (current.target && connections[current.connection_id].targets[current.target]) {
            if (connections[current.connection_id].targets[current.target].is_channel) {
              part_request(current.connection_id, current.target)
            } else {
              close_request(current.connection_id, current.target)
            }
          }
          break
          case "/MOTD":
          command_request(current.connection_id, "MOTD", 1)
          break
        }
      }
    }
  } else {
    send_privmsg(text, false)
  }
}

function send_privmsg(text, action) {
  if (current.target) {
    if (text != "") {
      privmsg_request(current.connection_id, current.target, text, action)
    }
  } else {
    local_error("Only commands may be entered when viewing the server log")
  }
}

function input_command(cmd, param) {
  if (current.connection_id) {
    switch (cmd) {
      case "/ME":
      if (param) {
        send_privmsg(param, true)
      }
      break
      case "/NICK":
      command_request(current.connection_id, "NICK " + param, 1)
      break
      case "/MSG":
      var command = double_arg(param)
      if (command) {
        if (!command.first.match(/^[&#!+.~]/)) {
          privmsg_request(current.connection_id, command.first, command.remainder, false)
        } else {
          local_error("Outside messages have been prevented by the local client")
        }
      } else {
        local_error("Usage is: /msg ≪user≫ ≪text≫")
      }
      break
      case "/NOTICE":
      var command = double_arg(param)
      if (command) {
        if (!command.first.match(/^[&#!+.~]/)) {
          notice_request(current.connection_id, command.first, command.remainder, false)
        } else {
          local_error("Outside notices have been prevented by the local client")
        }
      } else {
        local_error("Usage is: /notice ≪user≫ ≪text≫")
      }
      break
      case "/JOIN":
      join_request(current.connection_id, param)
      break
      case "/PART":
      part_request(current.connection_id, param)
      break
      case "/WHOIS":
      whois_user(current.connection_id, param)
      break
      case "/TOPIC":
      command_channel_check("TOPIC " + current.target + " :" + param, 1)
      break
      case "/OP":
      current_channel_mode_change("+o", param)
      break
      case "/DEOP":
      current_channel_mode_change("-o", param)
      break
      case "/VOICE":
      current_channel_mode_change("+v", param)
      break
      case "/DEVOICE":
      current_channel_mode_change("-v", param)
      break
      case "/USER":
      click_on_user(current.connection_id, param)
      break
      case "/MODE":
      var command = double_arg(param)
      if (command) {
        current_channel_mode_change(command.first, command.remainder)
      } else {
        current_channel_mode_change(param, "")
      }
      break
      case "/RAW":
      command_request(current.connection_id, param, 1)
      break
    }
  }
}

function current_channel_mode_change(mode, param) {
  command_channel_check("MODE " + current.target + " " + mode + " :" + param, 2)
}

function command_channel_check(command, wait) {
  if (current.connection_id && current.target && connections[current.connection_id] && connections[current.connection_id].targets[current.target]) {
    if (connections[current.connection_id].targets[current.target].is_channel) {
      command_request(current.connection_id, command, wait)
    }
  }
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

const LEFT_CURSOR = 37
const UP_CURSOR = 38
const RIGHT_CURSOR = 39
const DOWN_CURSOR = 40
const DELETE = 8
const TAB = 9

function detect_keypress(event) {
  if (!event.ctrlKey && event.which == TAB) {
    if ((tab_completion.repeat && tab_completion.response) || $("msg").value.match(/^\S+$/)) {
      tab_completion.response = true
    } else {
      tab_completion.response = false
    }
    if (tab_completion.response) {
      $("msg").value = complete_nick()
    } else {
      $("msg").value = $("msg").value.gsub(/(\S+)$/, function(match) {return complete_nick()})
    }
    return false
  } else {
    tab_completion.repeat = false
  }
  if (event.ctrlKey) {
    switch (event.which) {
      case LEFT_CURSOR:
      goto_prev_server()
      return false
      break
      case UP_CURSOR:
      goto_prev_target()
      return false
      break
      case RIGHT_CURSOR:
      goto_next_server()
      return false
      break
      case DOWN_CURSOR:
      goto_next_target()
      return false
      break
      case DELETE:
      change_to(current.connection_id, null)
      return false
      break
    }
  } else {
    switch (event.which) {
      case UP_CURSOR:
      prev_history()
      return false
      break
      case DOWN_CURSOR:
      next_history()
      return false
      break
    }
  }
  return true
}

function goto_prev_server() {
  var new_connection_id = move_in_element(current.connection_id, connections, -1)
  change_to(new_connection_id, null)
}

function goto_prev_target() {
  var new_target = move_in_element(current.target, connections[current.connection_id].targets, -1)
  change_to(current.connection_id, new_target)
}

function goto_next_server() {
  var new_connection_id = move_in_element(current.connection_id, connections, 1)
  change_to(new_connection_id, null)
}

function goto_next_target() {
  var new_target = move_in_element(current.target, connections[current.connection_id].targets, 1)
  change_to(current.connection_id, new_target)
}

function complete_nick() {
  if (tab_completion.repeat) {
    var match = tab_complete_lookup(tab_completion.last_match + 1)
    if (match) {
      if (tab_completion.response) {
        return match + ": "
      } else {
        return match
      }
    } else {
      tab_completion.repeat = false
      return tab_completion.search_term
    }
  } else {
    var search_term = $("msg").value.match(/(\S+)$/)
    if (search_term) {
      tab_completion.user_lookup = combined_users(current.connection_id, current.target)
      tab_completion.search_term = search_term[1].toLowerCase()
      tab_completion.repeat = true
      var match = tab_complete_lookup(0)
      if (match) {
        if (tab_completion.response) {
          return match + ": "
        } else {
          return match
        }
      } else {
        tab_completion.repeat = false
        return tab_completion.search_term
      }
    }
  }
}

function tab_complete_lookup(from) {
  for (var i = from; i < tab_completion.user_lookup.length; i++) {
    if (tab_completion.user_lookup[i].toLowerCase().indexOf(tab_completion.search_term) == 0) {
      tab_completion.last_match = i
      return tab_completion.user_lookup[i]
    }
  }
  return null
}

function combined_users(connection_id, target) {
  if (connections[connection_id].targets[target] && connections[connection_id].targets[target].is_channel) {
    return connections[connection_id].targets[target].opers.concat(connections[connection_id].targets[target].voicers, connections[connection_id].targets[target].users)
  }
  return new Array()
}

function prev_history() {
  input_history.position = Math.max(input_history.position - 1, 0)
  if (input_history.data[input_history.position]) {
    $("msg").value = input_history.data[input_history.position]
  }
}

function next_history() {
  input_history.position = Math.min(input_history.position + 1, input_history.data.length)
  if (input_history.data[input_history.position]) {
    $("msg").value = input_history.data[input_history.position]
  } else {
    $("msg").value = ""
  }
}

function build_array(parent) {
  var element_array = new Array()
  for (element in parent) {
    if (parent[element]) {
      element_array[element_array.length] = element
    }
  }
  return element_array
}

function move_in_array(reference, array_of_items, position) {
  if (reference) {
    var current_location = array_of_items.indexOf(reference)
    if (current_location != -1) {
      var new_position = current_location + position
      if (new_position >= array_of_items.length) {
        return array_of_items[new_position - array_of_items.length]
      } else if (new_position < 0) {
        return array_of_items[new_position + array_of_items.length]
      } else {
        return array_of_items[new_position]
      }
    } else {
      return null
    }
  } else {
    return array_of_items[0]
  }
}

function move_in_element(reference, element, position) {
  return move_in_array(reference, build_array(element), position)
}

function create_target_element(connection_id, target_name, is_channel) {
  connections[connection_id].targets[target_name] = new Object()
  connections[connection_id].targets[target_name]["is_channel"] = is_channel
  connections[connection_id].targets[target_name]["div_activity"] = create_div()
  if (is_channel) {
    connections[connection_id].open_channels.push(target_name)
    var activity_header = create_activity_div("activity_header", "Channel activity for " + target_name)
    connections[connection_id].targets[target_name]["div_users"] = create_div()
  } else {
    connections[connection_id].open_privmsgs.push(target_name)
    var activity_header = create_activity_div("activity_header", "Private messages with " + target_name)
  }
  div_activity(connection_id, target_name).appendChild(activity_header)
  connections[connection_id].targets[target_name]["div_target"] = create_div("connection_item clickable")
  connections[connection_id].targets[target_name]["div_target"].setAttribute("onclick", "change_to(\"" + connection_id + "\", \"" + target_name + "\")")
  var name = create_div("target")
  name.textContent = is_channel ? target_name : "@" + target_name
  var close_button = create_div("close_button")
  close_button.setAttribute("onclick", "close_window(\"" + connection_id + "\", \"" + target_name + "\")")
  connections[connection_id].targets[target_name]["div_unread"] = create_div("small unread_count")
  clear_unread(connection_id, target_name, false)
  connections[connection_id].targets[target_name].div_target.appendChild(name)
  connections[connection_id].targets[target_name].div_target.appendChild(close_button)
  connections[connection_id].targets[target_name].div_target.appendChild(connections[connection_id].targets[target_name].div_unread)
  connections[connection_id].div_group.appendChild(connections[connection_id].targets[target_name].div_target)
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
  connections[connection_id]["div_meta_group"] = create_div()
  connections[connection_id]["div_group"] = create_div()
  connections[connection_id]["join_button"] = create_div("tiny clickable header join_button with_hover")
  connections[connection_id]["join_channel"] = create_div()
  connections[connection_id].join_channel.style.display = "none"
  connections[connection_id]["join_input"] = create_element("input", "regular join_input")
  connections[connection_id]["join_input"].setAttribute("onkeypress", "if (event.which == 10 || event.which == 13) {join_input(\"" + connection_id + "\")}")
  var close_button = create_div("tiny clickable header join_button with_hover cancel_button")
  close_button.textContent = "Cancel"
  close_button.setAttribute("onclick", "cancel_join(\"" + connection_id + "\")")
  connections[connection_id].join_channel.appendChild(connections[connection_id]["join_input"])
  connections[connection_id].join_channel.appendChild(close_button)
  connections[connection_id].join_button.textContent = "Join channel..."
  connections[connection_id].join_button.setAttribute("onclick", "join(\"" + connection_id + "\")")
  connections[connection_id].div_meta_group.appendChild(connections[connection_id].div_group)
  connections[connection_id].div_meta_group.appendChild(connections[connection_id].join_button)
  connections[connection_id].div_meta_group.appendChild(connections[connection_id].join_channel)
  $("connections").appendChild(connections[connection_id].div_meta_group)
  add_connection_server(connection_id, connection_name)
}

function add_connection_server(connection_id, target_name) {
  connections[connection_id]["div_activity"] = create_div()
  connections[connection_id].div_activity.appendChild(create_activity_div("activity_header", "IRC Server connection with " + connections[connection_id].server_name))
  connections[connection_id]["div_server"] = create_div("connection_item clickable")
  connections[connection_id].div_server.setAttribute("onclick", "change_to(\"" + connection_id + "\")")
  var name = create_div("server")
  name.textContent = target_name
  var close_button = create_div("close_button")
  close_button.setAttribute("onclick", "disconnect(\"" + connection_id + "\")")
  connections[connection_id]["div_unread"] = create_div("small unread_count")
  clear_unread(connection_id, null, false)
  connections[connection_id].div_server.appendChild(name)
  connections[connection_id].div_server.appendChild(close_button)
  connections[connection_id].div_server.appendChild(connections[connection_id].div_unread)
  connections[connection_id].div_group.appendChild(connections[connection_id].div_server)
}

function change_to(connection_id, target) {
  if (current.connection_id) {
    remove_all($("activity"))
    div_connection_item(current.connection_id, current.target).className = "connection_item clickable"
  } else {
    hide("new_connection")
    show("activity")
    show("msg")
  }
  if (connection_id) {
    $("activity").appendChild(div_activity(connection_id, target))
    div_connection_item(connection_id, target).className = "connection_item selected"
    show("activity")
    scroll_to_bottom()
    $("msg").focus()
    clear_unread(connection_id, target, true)
  } else {
    show("new_connection")
    hide("activity")
    $("server_name").focus()
    hide("msg")
  }
  update_title(connection_id, target)
  update_topic(connection_id, target)
  show_or_hide_users(connection_id, target)
  update_activity(connection_id, target)
  current["connection_id"] = connection_id
  current["target"] = target
  update_activity_width()
  jar.put("current", current)
}

function show_or_hide_users(connection_id, target) {
  if (connection_id && target && connections[connection_id].targets[target].is_channel) {
    remove_all($("users"))
    update_user_list(connection_id, target)
    $("users").appendChild(connections[connection_id].targets[target].div_users)
    show("users")
  } else {
    hide("users")
  }
}

function update_user_list(connection_id, channel) {
  if (connections[connection_id].targets[channel].is_channel) {
    remove_all(connections[connection_id].targets[channel].div_users)
    var opers = connections[connection_id].targets[channel].opers.sort()
    var voicers = connections[connection_id].targets[channel].voicers.sort()
    var users = connections[connection_id].targets[channel].users.sort()
    for (var i = 0; i < opers.length; i++) { add_oper(connection_id, channel, opers[i]) }
    for (var i = 0; i < voicers.length; i++) { add_voicer(connection_id, channel, voicers[i]) }
    for (var i = 0; i < users.length; i++) { add_user(connection_id, channel, users[i]) }
  }
}

function add_user_element(connection_id, channel, name, type) {
  var div_op = create_div("user " + type)
  var div_span = create_element("span", "clickable with_hover")
  div_span.setAttribute("onclick", "click_on_user(\"" + connection_id + "\", \"" + name + "\")")
  div_span.textContent = name
  var div_whois = create_element("span", "small user_menu clickable")
  div_whois.innerHTML = "?"
  div_whois.setAttribute("onclick", "whois_user(\"" + connection_id + "\", \"" + name + "\")")
  div_op.appendChild(div_span)
  div_op.appendChild(div_whois)
  connections[connection_id].targets[channel].div_users.appendChild(div_op)
}

function click_on_user(connection_id, user) {
  if (!connections[connection_id].targets[user.toLowerCase()]) {
    new_window_request(connection_id, user)
  } else {
    change_to(connection_id, user.toLowerCase())
  }
}

function whois_user(connection_id, user) {
  command_request(connection_id, "WHOIS " + user, 1)
  change_to(connection_id)
}

function add_oper(connection_id, channel, name) {
  add_user_element(connection_id, channel, name, "op")
}

function add_voicer(connection_id, channel, name) {
  add_user_element(connection_id, channel, name, "voice")
  
}

function add_user(connection_id, channel, name) {
  add_user_element(connection_id, channel, name, "")
}

function update_topic(connection_id, target) {
  if (target) {
    if (!connections[connection_id].targets[target].is_channel) {
      $("topic").textContent = "Private messages with " + target
    } else {
      if (connections[connection_id].targets[target].topic) {
        $("topic").textContent = target + " - " + connections[connection_id].targets[target].topic + topic_appendix(connections[connection_id].targets[target].topic_creator, connections[connection_id].targets[target].topic_creation_time)
        linkify($("topic"))
      } else {
        $("topic").textContent = target
      }
    }
  } else {
    if (connection_id) {
      $("topic").textContent = "Server log for " + connections[connection_id].server_name
    } else {
      $("topic").textContent = "Create a new connection"
    }
  }
}

function topic_appendix(creator, creation_time) {
  return ((creator && creation_time) ? " (" + creator + ", " + get_brief_date(creation_time) + ")" : "")
}

function update_title(connection_id, target) {
  if (connection_id) {
    if (target) {
      set_title(target + ", " + connections[connection_id].server_name + ":" + connections[connection_id].server_port + ", " + connections[connection_id].nickname + " (" + connections[connection_id].real_name + ")")
    } else {
      set_title(connections[connection_id].server_name + ":" + connections[connection_id].server_port + ", " + connections[connection_id].nickname + " (" + connections[connection_id].real_name + ")")
    }
  } else {
    set_title("Web IRC")
  }
}

function update_activity(connection_id, target) {
  if (connection_id) {
    if (target) {
      set_activity(connections[connection_id].targets[target].last_activity)
    } else {
      set_activity(connections[connection_id].last_activity)
    }
  } else {
    set_activity()
  }
}

function set_activity(time) {
  if (time) {
    $("activity_info").textContent = "Last activity: " + timestamp_long(time)
  } else {
    $("activity_info").textContent = ""
  }
}

function set_title(text) {
  if (text) {
    $("title_text").textContent = text
  } else {
    $("title_text").textContent = ""
  }
}

function first_time_irc_handler(event) {
  if (request_done()) {
    irc_handler(event, true)
    var stored_current = jar.get("current")
    if (stored_current && connections[stored_current.connection_id]) {
      if (!stored_current.target || connections[stored_current.connection_id].targets[stored_current.target]) {
        change_to(stored_current.connection_id, stored_current.target)
      }
    }
  }
}

function irc_handler(event, first_time) {
  if (request_done()) {
    var response = request_to_json()
    process_history(response.history, !first_time)
    if (response.sync) {process_sync(response.sync)}
  }
}

function process_sync(close) {
  for (var i = 0; i < close.connections.length; i++) { close_connection(close.connections[i]) }
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

function remove_target(connection_id, target) {
  if (is_current(connection_id, target)) {
    change_to(connection_id)
  }
  if (connections[connection_id].targets[target]) {
    connections[connection_id].div_group.removeChild(connections[connection_id].targets[target]["div_target"])
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
  change_to()
  $("connections").removeChild(connections[connection_id].div_meta_group)
  connections[connection_id] = undefined
  destroy_bookmarks(connection_id, null)
}

function process_history(history, auto_open) {
  for (var connection_id in history) {
    var new_target = create_connection_if_necessary(connection_id, history[connection_id])
    if (history[connection_id].connection_count != connections[connection_id].connection_count) {
      connections[connection_id].connection_count = history[connection_id].connection_count
      close_all_targets(connection_id)
    }
    if (connections[connection_id].nickname != history[connection_id].nickname) {
      connections[connection_id].nickname = history[connection_id].nickname
      if (current.connection_id = connection_id) {
        update_title(connection_id, current.target)
      }
    }
    connections[connection_id].last_activity = history[connection_id].history.root_log.last_activity
    for (var n = 0; n < history[connection_id].history.root_log.data.length; n++) {
      var line = history[connection_id].history.root_log.data[n]
      if (check_if_new(connection_id, null, line.msg_id)) {
        update_read_count(connection_id, line.msg_id)
        root_log(connection_id, line)
        scroll_if_necessary(connection_id)
      }
    }
    if (auto_open && new_target) {change_to(connection_id)}
    for (var channel in history[connection_id].history.channels) {
      var new_target = create_target_if_necessary(connection_id, channel, true)
      update_users(connection_id, channel, history[connection_id].history.users[channel])
      update_target_attributes(connection_id, channel, history[connection_id].history.channels[channel])
      for (var n = 0; n < history[connection_id].history.channels[channel].data.length; n++) {
        var line = history[connection_id].history.channels[channel].data[n]
        if (check_if_new(connection_id, channel, line.msg_id)) {
          update_read_count(connection_id, line.msg_id)
          channel_log(connection_id, channel, line)
          scroll_if_necessary(connection_id, channel)
        }
      }
      if (auto_open && new_target) {change_to(connection_id, channel)}
    }
    for (var privmsg in history[connection_id].history.privmsgs) {
      var new_target = create_target_if_necessary(connection_id, privmsg, false)
      update_target_attributes(connection_id, privmsg, history[connection_id].history.privmsgs[privmsg])
      for (var n = 0; n < history[connection_id].history.privmsgs[privmsg].data.length; n++) {
        var line = history[connection_id].history.privmsgs[privmsg].data[n]
        if (check_if_new(connection_id, privmsg, line.msg_id)) {
          update_read_count(connection_id, line.msg_id)
          channel_log(connection_id, privmsg, line)
          scroll_if_necessary(connection_id, privmsg)
        }
      }
      if (auto_open && new_target) {change_to(connection_id, privmsg)}
    }
  }
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

function close_all_targets(connection_id) {
  for (target in connections[connection_id].targets) {
    if (connections[connection_id].targets[target] && connections[connection_id].targets[target].is_channel) {
      close_channel(connection_id, target)
    } else {
      close_privmsg(connection_id, target)
    }
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

function update_users(connection_id, channel, userlist) {
  connections[connection_id].targets[channel]["opers"] = userlist.opers
  connections[connection_id].targets[channel]["voicers"] = userlist.voicers
  connections[connection_id].targets[channel]["users"] = userlist.users
}

function update_target_attributes(connection_id, target, history_element) {
  connections[connection_id].targets[target]["topic"] = history_element.topic
  connections[connection_id].targets[target]["topic_creator"] = history_element.topic_creator
  connections[connection_id].targets[target]["topic_creation_time"] = history_element.topic_creation_time
  connections[connection_id].targets[target]["last_activity"] = history_element.last_activity
  
}

function update_read_count(connection_id, msg_id) {
  if (last_read[connection_id] && msg_id > last_read[connection_id]) {
    last_read[connection_id] = msg_id
  }
}

function root_log(connection_id, line) {
  check_for_timestamp(connection_id, null, line.timestamp)
  switch (line.type) {
    case NOTICE:
    root_notice(connection_id, line.source, line.msg)
    add_unread(connection_id, null, line.msg_id, false)
    break
    case SERVER:
    irc_server(connection_id, line.source, line.tag, line.params)
    add_unread(connection_id, null, line.msg_id, false)
    break
    case SERVER_ERROR:
    irc_server_error(connection_id, line.source, line.tag, line.params)
    add_unread(connection_id, null, line.msg_id, true)
    break
    case MODE:
    irc_user_mode(connection_id, line.source, line.target, line.add_mode, line.mode_char, line.param)
    break
    case CTCP:
    irc_ctcp(connection_id, line.source, line.cmd, line.param, line.response)
    add_unread(connection_id, null, line.msg_id)
    break
    case JOIN:
    irc_self_join(connection_id, line.channel)
    break
    case PART:
    irc_self_part(connection_id, line.channel, line.msg)
    break
    case KICK:
    irc_self_kick(connection_id, line.source, line.channel, line.reason)
    break
    case NICK:
    irc_self_nick(connection_id, line.new_nickname)
    break
    case CLIENT_ERROR:
    irc_client_error(connection_id, line.tag, line.params)
    add_unread(connection_id, null, line.msg_id, true)
    break
  }
}

function get_unread_div(connection_id, target) {
  if (target) {
    return connections[connection_id].targets[target].div_unread
  } else {
    return connections[connection_id].div_unread
  }
}

function is_current(connection_id, target) {
  if (connection_id == current.connection_id && target == current.target) {
    return true
  } else {
    return false
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

function add_unread(connection_id, target, msg_id, highlighted) {
  var div_unread = get_unread_div(connection_id, target)
  if (is_current(connection_id, target)) {
    create_bookmark(connection_id, target, msg_id)
  } else {
    if (get_bookmark(connection_id, target) < msg_id) {
      var div_unread = get_unread_div(connection_id, target)
      set_display(div_unread, "block")
      div_unread.textContent = parseInt(div_unread.textContent) + 1
      if (highlighted) {
        div_unread.className = "small unread_count highlighted"
      }
    }
  }
}

function clear_unread(connection_id, target, update_bookmark) {
  var div_unread = get_unread_div(connection_id, target)
  div_unread.className = "small unread_count"
  set_display(div_unread, "none")
  div_unread.textContent = 0
  if (update_bookmark) {
    create_bookmark(connection_id, target, last_read[connection_id])
    jar.put("bookmarks", bookmarks)
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

function local_error(text) {
  div_activity(current.connection_id, current.target).appendChild(create_activity_span("small server error", "INPUTERROR", "small server_info", text))
  scroll_if_necessary(current.connection_id, current.target)
}

function irc_client_error(connection_id, tag, params) {
  div_activity(connection_id).appendChild(create_activity_span("small server error", tag, "small server_info", params))
}

function irc_ctcp(connection_id, source, ctcp_cmd, ctcp_param, response) {
  add_activity(connection_id, undefined, create_activity_span("small server source", source, "small server ctcp", "CTCP " + ctcp_cmd, "small server_info", "Response: " + response))
}

function mention_me(connection_id, text) {
  if (text.toLowerCase().indexOf(connections[connection_id].nickname.toLowerCase()) == 0) {
    return true
  } else {
    return false
  }
}

function channel_log(connection_id, channel, line) {
  var timestamp = check_for_timestamp(connection_id, channel, line.timestamp)
  switch (line.type) {
    case JOIN:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_join(connection_id, channel, line.user, line)
    update_user_list(connection_id, channel)
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
    update_user_list(connection_id, channel)
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
    update_user_list(connection_id, channel)
    break
    case NICK:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_nick(connection_id, channel, line.user, line.new_nickname)
    update_user_list(connection_id, channel)
    break
    case QUIT:
    create_divider_if_necessary(connection_id, channel, false, timestamp)
    irc_quit(connection_id, channel, line.user, line.msg)
    update_user_list(connection_id, channel)
    break
  }
}

function irc_self_nick(connection_id, new_nickname) {
  irc_server_narrative(connection_id, "You have changed your nickname to " + new_nickname)
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

function add_channel_narrative(connection_id, channel, text) {
  var div_narrative = create_div("activity_element small narrative")
  div_narrative.textContent = text
  linkify(div_narrative)
  add_activity(connection_id, channel, div_narrative)
}

function irc_topic(connection_id, channel, source, text) {
  if (text == "") {
    add_channel_narrative(connection_id, channel, source + " has cleared the current topic")
  } else {
    add_channel_narrative(connection_id, channel, source + " has set the topic to “" + text + "”")
  }
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
    update_user_list(connection_id, channel)
    break
    case "v":
    if (add_mode) {
      voice_user(connection_id, channel, source, param)
    } else {
      devoice_user(connection_id, channel, source, param)
    }
    update_user_list(connection_id, channel)
    break
    default:
    add_channel_narrative(connection_id, channel, source + " has set the mode of " + target + " to " + mode_operator(add_mode) + mode_char + mode_param(param))
  }
}

function create_divider_if_necessary(connection_id, target, user_text, timestamp) {
 if (!timestamp && (user_text || connections[connection_id].targets[target].divider_required)) {
    div_activity(connection_id, target).appendChild(create_div("divider"))
  }
  connections[connection_id].targets[target].divider_required = user_text
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

function linkify(element) {
  element.innerHTML = element.innerHTML.gsub(/(http:\/\/([A-z0-9.\/?=+-:%]|&amp;)+)/, function(match){return "<a href=\"" + match[1] + "\" target=\"_blank\">" + match[1] + "</a>"})
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

function irc_server_narrative(connection_id, text) {
  add_activity(connection_id, null, create_activity_div("small server_narrative", text))
}

function root_notice(connection_id, source, msg) {
  if (source) {
    div_activity(connection_id).appendChild(create_activity_span("small server server_source", source, "small server notice", "NOTICE", "small server_info", msg))
  } else {
    div_activity(connection_id).appendChild(create_activity_span("small server notice", "NOTICE", "small server_info", msg))
  }
}

function create_target_if_necessary(connection_id, target, is_channel) {
  if (!connections[connection_id].targets[target]) {
    create_target_element(connection_id, target, is_channel)
    return true
  } else {
    return false
  }
}

function scroll_if_necessary(connection_id, target) {
  if (is_current(connection_id, target)) {
    scroll_to_bottom()
    update_topic(connection_id, target)
    update_activity(connection_id, target)
  }
}

function irc_server(connection_id, source, tag, text) {
  if (tag == "MOTD") {
    var div_motd = create_div("motd small")
    div_motd.textContent = text
    no_breaking_spaces(div_motd)
    linkify(div_motd)
    div_activity(connection_id).appendChild(div_motd)
  } else {
    div_activity(connection_id).appendChild(create_activity_span("small server server_source", source, "small server", tag, "small server_info", text))
  }
}

function no_breaking_spaces(element) {
  element.innerHTML = element.innerHTML.gsub(" ", "&nbsp;")
}

function irc_server_error(connection_id, source, tag, text) {
  div_activity(connection_id).appendChild(create_activity_span("small server server_source", source, "small server error", tag, "small server_info", text))
}

function create_element(type, class_name, id) {
  var element = document.createElement(type)
  if (class_name) {element.setAttribute("class", class_name)}
  if (id) {element.setAttribute("id", id)}
  return element
}

function create_div(class_name, id) {
  return create_element("div", class_name, id)
}

function activity_element() {
  return create_div("activity_element small")
}

function create_activity_div(type, text) {
  var div_text = create_element("div", type)
  div_text.textContent = text
  return div_text
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

function join(connection_id) {
  connections[connection_id].join_button.style.display = "none"
  connections[connection_id].join_channel.style.display = "block"
  connections[connection_id].join_input.value = "#"
  connections[connection_id].join_input.focus()
}

function cancel_join(connection_id) {
  connections[connection_id].join_button.style.display = "block"
  connections[connection_id].join_channel.style.display = "none"
}

function join_input(connection_id) {
  join_request(connection_id, connections[connection_id].join_input.value)
  cancel_join(connection_id)
}

function div_connection_item(connection_id, target) {
  if (target) {
    return connections[connection_id].targets[target].div_target
  } else {
    return connections[connection_id].div_server
  }
}

function disconnect(connection_id) {
  close_request(connection_id)
}

function close_window(connection_id, target) {
  if (connections[connection_id].targets[target].is_channel) {
    part_request(connection_id, target)
  } else {
    close_request(connection_id, target)
  }
}

function scroll_to_bottom() {
  var div_element = $("activity")
  div_element.scrollTop = div_element.scrollHeight
}

function show(element) {
  set_display($(element), "block")
}

function hide(element) {
  set_display($(element), "none")
}

function set_display(element, value) {
  element.style.display = value
}

function remove_all(element) {
  while(element.firstChild) {
    element.removeChild(element.firstChild)
  }
}