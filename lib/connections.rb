require "lib/irc"

class Connections
  @@count = 0
  
  def initialize
    @irc_connections = Hash.new
  end
  
  def add(connection)
    session = IRC.new(connection)
    @irc_connections[(@@count += 1).to_s] = {:session => session, :thread => Thread.new {session.connect}}
  end
  
  def remove(connection_id)
    if @irc_connections.has_key?(connection_id)
      @irc_connections[connection_id][:session].disconnect
      @irc_connections[connection_id][:thread].exit
      @irc_connections.delete(connection_id)
    end
  end
  
  def has?(connection_id)
    @irc_connections.has_key?(connection_id)
  end
  
  def [](connection_id)
    @irc_connections[connection_id][:session] if @irc_connections.has_key?(connection_id)
  end
  
  def each_connection_with_id
    @irc_connections.each_pair {|connection_id, connection| yield connection_id, connection[:session] if block_given?}
  end
end
