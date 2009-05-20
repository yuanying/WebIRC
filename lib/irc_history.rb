class IRCHistory
  attr_reader :nickname

  PRIVMSG = "p"
  ACTION = "a"
  NOTICE = "n"
  JOIN = "j"
  SELF_JOIN = "J"
  PART = "l"
  SELF_PART = "L"
  KICK = "k"
  QUIT = "q"
  TOPIC = "t"
  NICK = ">"
  SERVER = "-"
  SERVER_ERROR = "*"
  CLIENT_ERROR = "!"
  MODE = "m"
  CTCP_RESPONSE = "c"
  CTCP_REQUEST = "C"
  CTCP_REPLY = "N"

  USER_OP = "@"
  USER_VOICE = "+"

  MODE_OP = "o"
  MODE_VOICE = "v"

  AUTH = "auth"

  def initialize(nickname)
    @nickname = nickname
    @channels, @privmsgs = Hash.new, Hash.new
    @root_log = {:history => Array.new, :last_activity => Time.now.to_i}
    @msg_id = 0
  end
  
  def stoned?
    (Time.now.to_i - @root_log[:last_activity]) > 1200 # 20 Minutes
  end

  def action(source, target, msg)
    if target_is_self?(target)
      add_history(@privmsgs, source, {:type => ACTION, :source => source, :msg => msg})
    else
      add_history(@channels, target, {:type => ACTION, :source => source, :msg => msg})
    end
  end

  def ctcp_response(source, cmd, param, response)
    add_history(@root_log, nil, {:type => CTCP_RESPONSE, :source => source, :cmd => cmd, :param => param, :response => response})
  end

  def ctcp_request(target, cmd, param)
    add_history(@root_log, nil, {:type => CTCP_REQUEST, :target => target, :cmd => cmd, :param => param})
  end

  def ctcp_reply(source, cmd, param)
    add_history(@root_log, nil, {:type => CTCP_REPLY, :source => source, :cmd => cmd, :param => param})
  end

  def names_list(channel, user, user_type)
    channels(channel)[:userlist].add(user)
    case user_type
    when USER_OP
      channels(channel)[:userlist].op(user)
    when USER_VOICE
      channels(channel)[:userlist].voice(user)
    end
  end

  def server_reply_welcome(nickname)
    @nickname = nickname
  end

  def server_reply_topic(channel, topic)
    channels(channel)[:topic] = topic
  end

  def server_reply_topic_creation(channel, creator, time)
    channels(channel)[:topic_creator] = creator
    channels(channel)[:topic_creation_time] = time
  end

  def server_reply_raw(source, tag, params)
    add_history(@root_log, nil, {:type => SERVER, :source => source, :tag => tag, :params => params})
  end

  def server_error_reply_raw(source, tag, params)
    add_history(@root_log, nil, {:type => SERVER_ERROR, :source => source, :tag => tag, :params => params})
  end

  def reconnection(tag, params)
    @channels, @privmsgs = Hash.new, Hash.new
    add_history(@root_log, nil, {:type => CLIENT_ERROR, :tag => tag, :params => params})
  end

  def invite(source, user, channel)
    if target_is_self?(user)
      add_history(@root_log, nil, {:type => INVITE, :user => user, :channel => channel})
    else
      add_history(@channels, channel, {:type => INVITE, :user => user, :channel => channel})
    end
  end

  def join(user, channel)
    add_history(@root_log, nil, {:type => JOIN, :channel => channel}) if target_is_self?(user)
    add_history(@channels, channel, {:type => JOIN, :user => user}) if channels(channel)[:userlist].add(user)
  end

  def kick(source, user, channel, reason)
    if target_is_self?(user)
      add_history(@root_log, nil, {:type => KICK, :source => source, :channel => channel, :reason => reason})
      @channels.delete(channel.downcase)
    else
      add_history(@channels, channel, {:type => KICK, :source => source, :user => user, :reason => reason}) if channels(channel)[:userlist].remove(user)
    end
  end

  def mode(source, target, add_mode, mode_char, param)
    if target_is_self?(target)
      add_history(@root_log, nil, {:type => MODE, :source => source, :target => target, :add_mode => add_mode, :mode_char => mode_char, :param => param})
    elsif joined_channel?(target)
      add_history(@channels, target, {:type => MODE, :source => source, :target => target, :add_mode => add_mode, :mode_char => mode_char, :param => param})
      case mode_char
      when MODE_OP
        if add_mode then channels(target)[:userlist].op(param) else channels(target)[:userlist].deop(param); end
      when MODE_VOICE
        if add_mode then channels(target)[:userlist].voice(param) else channels(target)[:userlist].devoice(param); end
      end
    end
  end

  def nick(user, new_nickname)
    if target_is_self?(user)
      @nickname = new_nickname
      add_history(@root_log, nil, {:type => NICK, :new_nickname => new_nickname})
    end
    @channels.each_pair {|name, history| add_history(@channels, name, {:type => NICK, :user => user, :new_nickname => new_nickname}) if channels(name)[:userlist].rename(user, new_nickname)}
  end

  def notice(source, target, msg)
    if joined_channel?(target)
      add_history(@channels, target, {:source => source, :type => NOTICE, :msg => msg})
    elsif source and in_private_chat?(source)
      add_history(@privmsgs, source, {:source => source, :type => NOTICE, :msg => msg})
    else
      add_history(@root_log, nil, {:source => source, :type => NOTICE, :msg => msg})
    end
  end

  def part(source, channel, msg)
    if target_is_self?(source)
      add_history(@root_log, nil, {:type => PART, :channel => channel, :msg => msg})
      @channels.delete(channel.downcase)
    else
      add_history(@channels, channel, {:type => PART, :source => source, :msg => msg}) if channels(channel)[:userlist].remove(source)
    end
  end

  def joined_channel?(channel)
    @channels[channel.downcase] != nil
  end

  def in_private_chat?(user)
    @privmsgs[user.downcase] != nil
  end

  def ping(text)
    update_activity(@root_log)
  end

  def privmsg(source, target, msg)
    if target_is_self?(target)
      add_history(@privmsgs, source, {:type => PRIVMSG, :source => source, :msg => msg})
    else
      add_history(@channels, target, {:type => PRIVMSG, :source => source, :msg => msg})
    end
  end
  
  def self_privmsg(target, msg)
    self_input(PRIVMSG, target, msg)
  end
  
  def self_action(target, msg)
    self_input(ACTION, target, msg)
  end
  
  def self_notice(target, msg)
    self_input(NOTICE, target, msg)
  end
  
  def quit(user, msg)
    add_history(@privmsgs, user, {:type => QUIT, :user => user, :msg => msg}) if in_private_chat?(user)
    @channels.each_pair {|name, history| add_history(@channels, name, {:type => QUIT, :user => user, :msg => msg}) if channels(name)[:userlist].remove(user)}
  end

  def topic(source, channel, text)
    server_reply_topic(channel, text)
    server_reply_topic_creation(channel, source, Time.now.to_i)
    add_history(@channels, channel, {:type => TOPIC, :source => source, :text => text})
  end
  
  def history_iphone(last_read)
    { :channels => target_history(@channels, last_read),
      :privmsgs => target_history(@privmsgs, last_read) }
  end
  
  def history(last_read)
    { :root_log => {:last_activity => @root_log[:last_activity], :data => since_last_read(@root_log, last_read)},
      :channels => target_history(@channels, last_read),
      :privmsgs => target_history(@privmsgs, last_read),
      :users => users }
  end
  
  def users
    users_hash = Hash.new
    @channels.each_pair {|name, target| users_hash[name] = { :opers   => target[:userlist].opers,
                                                             :voicers => target[:userlist].voicers,
                                                             :users   => target[:userlist].users } }
    users_hash
  end
  
  def close(target)
    @privmsgs.delete(target)
  end
  
  def new_window(target)
    privmsgs(target)
  end
  
  private
  
  def self_input(type, target, msg)
    if @channels.include?(target.downcase) or target =~ /^[&#!+.~]/
      add_history(@channels, target, {:type => type, :source => @nickname, :msg => msg})
    else
      add_history(@privmsgs, target, {:type => type, :source => @nickname, :msg => msg})
    end
  end

  def target_history(source, last_read)
    history = Hash.new
    source.each_pair do |name, target|
      history[name] = { :topic => target[:topic],
                        :topic_creator => target[:topic_creator],
                        :topic_creation_time => target[:topic_creation_time],
                        :last_activity => target[:last_activity],
                        :data => since_last_read(target, last_read)}
    end
    history
  end
  
  def since_last_read(element, last_read)
    history = Array.new
    element[:history].each {|element| history << element if element[:msg_id] > last_read}
    history
  end
  
  def add_history(target, name, elements)
    name = name.downcase if name
    case target
    when @privmsgs
      if name
        privmsgs(name)[:history] << add_msg_id(elements)
        pare_down_history(target[name])
        update_activity(target[name])
      else
        add_history(@root_log, nil, elements)
      end
    when @channels
      channels(name)[:history] << add_msg_id(elements)
      pare_down_history(target[name])
      update_activity(target[name])
    else
      @root_log[:history] << add_msg_id(elements)
      pare_down_history(target)
      update_activity(target)
    end
  end

  def pare_down_history(target)
    target[:history].delete_at(0) if target[:history].length > 256
  end

  def update_activity(target)
    target[:last_activity] = Time.now.to_i
  end

  def add_msg_id(object)
    object.merge({:msg_id => (@msg_id += 1), :timestamp => Time.now.to_i})
  end

  def target_is_self?(target)
    target = target.downcase
    target == @nickname.downcase or target == AUTH or target =~ /^\$/
  end

  def privmsgs(target)
    target = target.downcase
    @privmsgs[target] or @privmsgs[target] = {:history => Array.new, :last_activity => Time.now.to_i}
  end

  def channels(target)
    target = target.downcase
    @channels[target] or @channels[target] = {:history => Array.new, :userlist => Userlist.new, :last_activity => Time.now.to_i}
  end

  class Userlist
    attr_reader :opers, :users

    def initialize
      @opers, @voicers, @users = Array.new, Array.new, Array.new
    end

    def add(nickname)
      @users = @users.push(nickname) unless has?(nickname)
    end

    def remove(nickname)
      if @opers.include?(nickname)
        @voicers.delete(nickname) if @voicers.include?(nickname)
        return @opers.delete(nickname)
      end
      return @voicers.delete(nickname) if @voicers.include?(nickname)
      @users.delete(nickname) if @users.include?(nickname)
    end

    def has?(nickname)
      @opers.include?(nickname) or @voicers.include?(nickname) or @users.include?(nickname)
    end

    def op(nickname)
      @opers.push(nickname) if (@voicers.include?(nickname) or @users.delete(nickname))
    end

    def voice(nickname)
      return @voicers.push(nickname) if @opers.include?(nickname)
      @voicers.push(nickname) if @users.delete(nickname)
    end
    
    def voicers
      filtered_voice = Array.new
      @voicers.each {|user| filtered_voice << user unless @opers.include?(user)}
      filtered_voice
    end

    def deop(nickname)
      return @opers.delete(nickname) if @voicers.include?(nickname)
      @users.push(nickname) if @opers.delete(nickname)
    end

    def devoice(nickname)
      return @voicers.delete(nickname) if @opers.include?(nickname)
      @users.push(nickname) if @voicers.delete(nickname)
    end

    def rename(nickname, new_nickname)
      if @opers.delete(nickname)
        @voicers = @voicers.push(new_nickname) if @voicers.delete(nickname)
        return @opers = @opers.push(new_nickname)
      end
      return @voicers = @voicers.push(new_nickname) if @voicers.delete(nickname)
      @users = @users.push(new_nickname) if @users.delete(nickname)
    end
  end
end
