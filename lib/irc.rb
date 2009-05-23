require "socket"
require "iconv"
require "lib/irc_history"

$script_name = "WebIRC client"
$script_version = "0.9"
$script_source  = "http://github.com/andyherbert/WebIRC/tree/master"

class IRC
  def initialize(connection, rss_feed)
    @connection = connection
    @history = IRCHistory.new(@connection["nickname"])
    @joined_channels = Hash.new
    @connection_count = 0
    @rss_feed = rss_feed
  end
  
  def connect
    loop do
      connection_thread = Thread.new {connection_loop}
      loop do
        sleep 300 # 5 minutes
        if @history.stoned?
          @connection_count += 1
          @history.reconnection(:STONEDCONNECTION, "Connection appears to be stoned, attempting reconnection")
          disconnect
          connection_thread.exit
          break
        end
      end
    end
  end
  
  def connection_loop(retries = 4, reconnect_wait = 90)
    begin
      @socket = TCPSocket::open(@connection["server_name"], (@connection["server_port"] or 6667))
      send("PASS #{@connection["password"]}") if @connection["password"] and !@connection["password"].empty?
      send("NICK #{@connection["nickname"]}")
      send("USER #{@connection["user_name"]} #{user_mask} * :#{@connection["real_name"]}")
      loop do
          ready = select([@socket, $stdin], nil, nil, nil)
          next unless ready
          for msg in ready[0]
              if msg == $stdin then
                  return if $stdin.eof
                  msg = $stdin.gets
                  send(msg)
              elsif msg == @socket then
                  return if @socket.eof
                  msg = @socket.gets
                  main_loop(strip_colours_and_encode_to_utf(msg))
              end
          end
      end
    rescue SocketError # Unable to connect
      @connection_count += 1
      retry if server_retry(:SOCKETERROR, "Unable to connect with #{@connection["server_name"]}", retries -= 1, reconnect_wait)
    rescue Errno::ECONNREFUSED # Connection refused
      @connection_count += 1
      retry if server_retry(:CONNREFUSED, "Connection refused with #{@connection["server_name"]}")
    rescue Errno::ECONNRESET # Connection reset
      @connection_count += 1
      retry if server_retry(:CONNRESET, "Connection reset with #{@connection["server_name"]}", retries -= 1, reconnect_wait)
    rescue Errno::ETIMEDOUT # Connection timed out
      @connection_count += 1
      retry if server_retry(:TIMEDOUT, "Connection timed out with #{@connection["server_name"]}", retries -= 1, reconnect_wait)
    rescue
      puts $!
    end
  end
  
  def disconnect
    send("QUIT")
  end
  
  def history_iphone(last_read)
    {
      :server_name => @connection["server_name"],
      :nickname => @history.nickname,
      :connection_count => @connection_count,
      :history => @history.history_iphone(last_read)
    }
  end
  
  def history(last_read)
    {
      :server_name => @connection["server_name"],
      :server_port => @connection["server_port"],
      :nickname => @history.nickname,
      :user_name => @connection["user_name"],
      :real_name => @connection["real_name"],
      :connection_count => @connection_count,
      :history => @history.history(last_read)
    }
  end
  
  def sync_channels(channels)
    close_channels = Array.new
    channels.each {|channel| close_channels << channel unless @history.joined_channel?(channel)}
    close_channels
  end
  
  def sync_privmsgs(privmsgs)
    close_privmsgs = Array.new
    privmsgs.each {|privmsg| close_privmsgs << privmsg unless @history.in_private_chat?(privmsg)}
    close_privmsgs
  end
  
  def close(target)
    @history.close(target)
  end
  
  def send(text)
    begin
      @socket.send "#{text}\n", 0
    rescue
      return nil
    end
    text
  end
  
  def join(channel, key)
    if key
      send("JOIN #{channel} #{key}")
    else
      send("JOIN #{channel}")
    end
    @joined_channels[channel.downcase] = key
  end
  
  def part(channel, msg)
    if msg
      send("PART #{channel} :#{msg}")
    else
      send("PART #{channel}")
    end
    @joined_channels.delete(channel.downcase)
  end
  
  def privmsg(target, text, ctcp_cmd)
    if ctcp_cmd
      case ctcp_cmd
      when "ACTION"
        @history.self_action(target, text)
      else
        @history.ctcp_request(target, ctcp_cmd, text)
      end
      if text
        send("PRIVMSG #{target} :\001#{ctcp_cmd} #{text}\001")
      else
        send("PRIVMSG #{target} :\001#{ctcp_cmd}\001")
      end
    else
      @history.self_privmsg(target, text)
      send("PRIVMSG #{target} :#{text}")
    end
  end
  
  def notice(target, text)
    @history.self_notice(target, text)
    send("NOTICE #{target} :#{text}")
  end
  
  def new_window(target)
    @history.new_window(target)
  end
  
  private

  def server_retry(tag, text, retries = 0, reconnect_wait = nil)
    if reconnect_wait
      if retries == 0
        @history.reconnection(tag, "Final attempt to reconnect failed")
        false
      else
        @history.reconnection(tag, text + ", attempting reconnect after #{reconnect_wait} seconds, " + (retries == 1 ? "1 retry left" : "#{retries} retries left"))
        sleep reconnect_wait
        true
      end
    else
      @history.reconnection(tag, text)
      false
    end
  end

  def main_loop(text)
    if text =~ /^:/
      text.scan(/^:(\S[^!\s]+)!?(\S*)\s(\S+)\s(.*)$/) do |source, netmask, cmd, params|
        case cmd
        when /^\d+$/
          double_arg(params) {|target, text| server_code(source, target, cmd.to_i, text)}
        when "INVITE"
          double_arg(params) {|user, channel| @history.invite(source, user, channel)}
        when "JOIN"
          @history.join(source, trim(params))
        when "KICK"
          triple_arg(params) {|channel, user, reason| @history.kick(source, user, channel, reason)}
        when "MODE"
          to_modes(params) {|target, add_mode, mode_char, param| @history.mode(source, target, add_mode, mode_char, param)}
        when "NICK"
          @history.nick(source, trim(params))
        when "NOTICE"
          double_arg(params) do |target, msg|
            case msg
            when /^\001.*\001$/
              ctcp_msg(msg) do |ctcp_cmd, ctcp_param|
                @history.ctcp_reply(source, ctcp_cmd, ctcp_param)
              end
            else
              @history.notice(source, target, msg)
            end
          end
        when "PART"
          double_arg(params) {|channel, msg| @history.part(source, trim(channel), msg)}
        when "PRIVMSG"
          double_arg(params) do |target, msg|
            msg = ctcp_msg(msg) do |ctcp_cmd, ctcp_param|
              if ctcp_cmd == "ACTION"
                @history.action(source, target, ctcp_param)
              else
                @history.ctcp_response(source, ctcp_cmd, ctcp_param, response = do_ctcp(source, ctcp_cmd, ctcp_param))
                send("NOTICE #{source} :\001#{response}\001")
              end
            end
            @history.privmsg(source, target, msg) unless msg.empty?
            msg.scan(/((https?:\/\/|www\.)[A-z0-9.\/?=+-:%@&()#~]+)/i) do |link, prefix|
              link = "http://#{link}" if prefix =~ /^www\./i
              @rss_feed.add(link, msg, source, netmask, ((target == @history.nickname) ? "Private message" : target))
            end
          end
        when "QUIT"
          @history.quit(source, trim(params))
        when "TOPIC"
          double_arg(params) {|channel, text| @history.topic(source, channel, text)}
        else
        end
      end
    else
      text.scan(/^(\S+)\s(.*)/) do |cmd, params|
        case cmd
        when "ERROR"
          @history.server_error_reply_raw(nil, "ERROR", trim(params))
        when "NICK"
          nick(@history.nickname, trim(params))
        when "NOTICE"
          double_arg(params) {|target, msg| @history.notice(nil, target, msg)}
        when "PING"
          send("PONG :#{response = trim(params)}")
          @history.ping(response)
        else
          puts "!!!!#{text}"
        end
      end
    end
  end

  def server_code(source, target, code, text)
    case code
    when 001 # Welcome message
      text.scan(/(\S[^!\s]+)!?(\S*)$/) {|nickname, netmask| @history.server_reply_welcome(nickname)}
    when 332 # Current topic
      double_arg(text) {|channel, topic| @history.server_reply_topic(channel, topic)}
    when 333 # Topic creator and date
      triple_arg(text) {|channel, creator, time| @history.server_reply_topic_creation(channel, creator, time.to_i)}
    when 353 # Names list
      triple_arg(text) do |type, channel, users|
        users.split.each do |token|
          token.scan(/^([@\+])?(.*)$/) {|user_type, user| @history.names_list(channel, user, user_type)}
        end
      end
    when 376 # End of MOTD
      @joined_channels.each_pair {|channel, key| send("JOIN #{channel} #{key}")}
    end
    case code
    when 1..400
      @history.server_reply_raw(source, server_code_tag(code), text)
    else
      @history.server_error_reply_raw(source, server_error_code_tag(code), text)
    end
  end
  
  def server_code_tag(code)
    case code
    when 1
      :WELCOME
    when 2
      :YOURHOST
    when 3
      :CREATED
    when 4
      :MYINFO
    when 5
      :BOUNCE
    when 302
      :USERHOST
    when 303
      :ISON
    when 301
      :AWAY
    when 305
      :UNAWAY
    when 306
      :NOWAWAY
    when 311
      :WHOISUSER
    when 312
      :WHOISSERVER
    when 313
      :WHOISOPERATOR
    when 317
      :WHOISIDLE
    when 318
      :ENDOFWHOIS
    when 319
      :WHOISCHANNELS
    when 314
      :WHOWASUSER
    when 369
      :ENDOFWHOWAS
    when 321
      :LISTSTART
    when 322
      :LIST
    when 323
      :LISTEND
    when 325
      :UNIQOPIS
    when 324
      :CHANNELMODEIS
    when 331
      :NOTOPIC
    when 332
      :TOPIC
    when 333
      :TOPICCREATION
    when 341
      :INVITING
    when 342
      :SUMMONING
    when 346
      :INVITELIST
    when 347
      :ENDOFINVITELIST
    when 348
      :EXCEPTLIST
    when 349
      :ENDOFEXCEPTLIST
    when 351
      :VERSION
    when 352
      :WHOREPLY
    when 315
      :ENDOFWHO
    when 353
      :NAMREPLY
    when 366
      :ENDOFNAMES
    when 364
      :LINKS
    when 365
      :ENDOFLINKS
    when 367
      :BANLIST
    when 368
      :ENDOFBANLIST
    when 371
      :INFO
    when 374
      :ENDOFINFO
    when 375
      :MOTDSTART
    when 372
      :MOTD
    when 376
      :ENDOFMOTD
    when 381
      :YOUREOPER
    when 382
      :REHASHING
    when 383
      :YOURESERVICE
    when 391
      :TIME
    when 392
      :USERSSTART
    when 393
      :USERS
    when 394
      :ENDOFUSERS
    when 395
      :NOUSERS
    when 200
      :TRACELINK
    when 201
      :TRACECONNECTING
    when 202
      :TRACEHANDSHAKE
    when 203
      :TRACEUNKNOWN
    when 204
      :TRACEOPERATOR
    when 205
      :TRACEUSER
    when 206
      :TRACESERVER
    when 207
      :TRACESERVICE
    when 208
      :TRACENEWTYPE
    when 209
      :TRACECLASS
    when 210
      :TRACERECONNECT
    when 261
      :TRACELOG
    when 262
      :TRACEEND
    when 211
      :STATSLINKINFO
    when 212
      :STATSCOMMANDS
    when 219
      :ENDOFSTATS
    when 242
      :STATSUPTIME
    when 243
      :STATSOLINE
    when 221
      :UMODEIS
    when 234
      :SERVLIST
    when 235
      :SERVLISTEND
    when 250
      :STATSDLINE
    when 251
      :LUSERCLIENT
    when 252
      :LUSEROP
    when 253
      :LUSERUNKNOWN
    when 254
      :LUSERCHANNELS
    when 255
      :LUSERME
    when 256
      :ADMINME
    when 257
      :ADMINLOC1
    when 258
      :ADMINLOC2
    when 259
      :ADMINEMAIL
    when 263
      :TRYAGAIN
    else
      :INFO
    end
  end

  def server_error_code_tag(code)
    case code
    when 401
      :NOSUCHNICK
    when 402
      :NOSUCHSERVER
    when 403
      :NOSUCHCHANNEL
    when 404
      :CANNOTSENDTOCHAN
    when 405
      :TOOMANYCHANNELS
    when 406
      :WASNOSUCHNICK
    when 407
      :TOOMANYTARGETS
    when 408
      :NOSUCHSERVICE
    when 409
      :NOORIGIN
    when 411
      :NORECIPIENT
    when 412
      :NOTEXTTOSEND
    when 413
      :NOTOPLEVEL
    when 414
      :WILDTOPLEVEL
    when 415
      :BADMASK
    when 421
      :UNKNOWNCOMMAND
    when 422
      :NOMOTD
    when 423
      :NOADMININFO
    when 424
      :FILEERROR
    when 431
      :NONICKNAMEGIVEN
    when 432
      :ERRONEUSNICKNAME
    when 433
      :NICKNAMEINUSE
    when 436
      :NICKCOLLISION
    when 437
      :UNAVAILRESOURCE
    when 441
      :USERNOTINCHANNEL
    when 442
      :NOTONCHANNEL
    when 443
      :USERONCHANNEL
    when 444
      :NOLOGIN
    when 445
      :SUMMONDISABLED
    when 446
      :USERSDISABLED
    when 451
      :NOTREGISTERED
    when 461
      :NEEDMOREPARAMS
    when 462
      :ALREADYREGISTRED
    when 463
      :NOPERMFORHOST
    when 464
      :PASSWDMISMATCH
    when 465
      :YOUREBANNEDCREEP
    when 466
      :YOUWILLBEBANNED
    when 467
      :KEYSET
    when 471
      :CHANNELISFULL
    when 472
      :UNKNOWNMODE
    when 473
      :INVITEONLYCHAN
    when 474
      :BANNEDFROMCHAN
    when 475
      :BADCHANNELKEY
    when 476
      :BADCHANMASK
    when 477
      :NOCHANMODES
    when 478
      :BANLISTFULL
    when 481
      :NOPRIVILEGES
    when 482
      :CHANOPRIVSNEEDED
    when 483
      :CANTKILLSERVER
    when 484
      :RESTRICTED
    when 485
      :UNIQOPPRIVSNEEDED
    when 491
      :NOOPERHOST
    when 501
      :UMODEUNKNOWNFLAG
    when 502
      :USERSDONTMATCH
    else
      :ERROR
    end
  end

  def do_ctcp(source, ctcp_cmd, ctcp_param)
    case ctcp_cmd
    when "CLIENTINFO"
      ctcp_reply("ERRMSG #{ctcp_cmd}", ":Unsupported command")
    when "ERRMSG"
      ctcp_reply("ERRMSG #{ctcp_cmd}", ":Unsupported command")
    when "FINGER"
      ctcp_reply(ctcp_cmd, @connection["real_name"])
    when "PING"
      ctcp_reply(ctcp_cmd, ctcp_param)
    when "SOURCE"
      ctcp_reply(ctcp_cmd, $script_source)
    when "TIME"
      ctcp_reply(ctcp_cmd, Time.now.localtime.to_s)
    when "USERINFO"
      ctcp_reply(ctcp_cmd, @connection["real_name"])
    when "VERSION"
      ctcp_reply(ctcp_cmd, "#{$script_name}:#{$script_version}:#{RUBY_PLATFORM} running Ruby interpreter #{RUBY_VERSION}")
    else
      ctcp_reply("ERRMSG #{ctcp_cmd}", ":Unknown command")
    end
  end

  def ctcp_reply(ctcp_cmd, ctcp_param = nil)
    "#{ctcp_cmd}#{ctcp_param ? " " + ctcp_param : ""}"
  end

  def strip_colours_and_encode_to_utf(text)
    text.gsub!(/(\cc\d+(?:,\d+)?|\cc|\cb|\cu|\co)/, "")
    begin
      Iconv.conv("utf-8", "utf-8", text)
    rescue
      Iconv.conv("utf-8//ignore", "ISO-8859-1", text)
    end
  end

  def trim(text)
    if text =~ /^:(.*)$/
      $1.strip
    else
      text.strip
    end
  end

  def user_mask
    (@connection["wallops"] ? 1 << 2 : 0) + (@connection["invisible"] ? 1 << 3 : 0)
  end

  def double_arg(text)
    text.scan(/^(\S+)\s(.*)$/) {|arg1, arg2| yield arg1, trim(arg2) if block_given?}
  end

  def triple_arg(text)
    text.scan(/^(\S+)\s(\S+)\s(.*)$/) {|arg1, arg2, arg3| yield arg1, arg2, trim(arg3) if block_given?}
  end

  def ctcp_msg(text)
    text.scan(/\001(\S+)\s?(.*?)\001/) {|ctcp_cmd, ctcp_param| yield ctcp_cmd, trim(ctcp_param) if block_given?}
    text.gsub(/\001.*?\001/, "")
  end

  def to_modes(text)
    text.scan(/^(\S+)\s(\S+)\s?(.*)$/) do |channel, modes, targets|
      targets, add_mode, index = trim(targets).split, true, -1
      trim(modes).split(//).each do |mode_char|
        if mode_char =~ /[\+-]/ then add_mode = (mode_char == "+") else
          if mode_char =~ /[bdekIoqv]/ or (add_mode and mode_char =~ /[fJl]/)
            yield channel, add_mode, mode_char, targets[index] if block_given? and targets[index += 1]
          else
            yield channel, add_mode, mode_char, nil if block_given?
          end
        end
      end
    end
  end
end
