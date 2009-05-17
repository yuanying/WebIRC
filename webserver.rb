require "lib/webircconfig"
require "lib/connections"
require "lib/rss"
require "rubygems"
require "sinatra"
require "json"

mime :json, "application/json"
mime :rss, "application/rss+xml"
mime :raw, "application/octet-stream"

configure do
  @@config = WebIRCConfig.new
  @@rss_feed = RSSFeed.new
  @@connections = Connections.new(@@rss_feed)
end

helpers do
  def config(key)
    @@config[key]
  end
  
  def protected?
    @@config["web_user"] and @@config["web_password"]
  end
  
  def protected!
    response["WWW-Authenticate"] = %(Basic realm="WebIRC") and throw(:halt, [401, "Not authorized\n"]) and return unless !protected? or authorized?
  end
  
  def authorized?
    @auth ||=  Rack::Auth::Basic::Request.new(request.env)
    @auth.provided? and @auth.basic? and @auth.credentials and @auth.credentials == [@@config["web_user"], @@config["web_password"]]
  end
  
  def get_history_iphone(last_read)
    history = Hash.new
    @@connections.each_connection_with_id do |connection_id, connection|
      history[connection_id] = connection.history_iphone(last_read.has_key?(connection_id) ? last_read[connection_id] : 0)
    end
    history
  end
  
  def get_history(last_read)
    history = Hash.new
    @@connections.each_connection_with_id do |connection_id, connection|
      history[connection_id] = connection.history(last_read.has_key?(connection_id) ? last_read[connection_id] : 0)
    end
    history
  end
  
  def get_users
    users = Hash.new
    @@connections.each_connection_with_id do |connection_id, connection|
      users[connection_id] = connection.users
    end
    users
  end
  
  def sync(open)
    close = Hash.new
    close_connections = Array.new
    open.each_key do |connection_id|
      if @@connections.has?(connection_id)
        close[connection_id] = {:channels => @@connections[connection_id].sync_channels(open[connection_id]["channels"]), :privmsgs => @@connections[connection_id].sync_privmsgs(open[connection_id]["privmsgs"])}
      else
        close_connections << connection_id
      end
    end
    {:targets => close, :connections => close_connections}
  end
  
  def get_update_iphone(json_object)
    {:history => get_history_iphone(json_object["last_read"]), :sync => sync(json_object["sync"])}.to_json
  end
  
  def get_update(json_object)
    {:history => get_history(json_object["last_read"]), :sync => sync(json_object["sync"])}.to_json
  end
  
  def json_request(request)
    JSON.parse(request.env["rack.input"].read)
  end
end


get "/", :agent => /Apple.*Mobile.*Safari/ do
  protected!
  erb :home_iphone
end

get "/" do
  protected!
  erb :home
end

get "/public/:filename" do
  if @@config.exists?(params["filename"])
    content_type :raw
    @@config.get_file(params["filename"]) {|file| file.read}
  else
    raise Sinatra::NotFound
  end
end

get "/upload" do
  protected!
  erb :upload
end

post "/upload" do
  protected!
  @filename = params["datafile"][:filename]
  @@config.save_file(@filename) {|file| file.write(params["datafile"][:tempfile].read)}
  erb :uploaded
end

post "/connect" do
  protected!
  content_type :json
  command = json_request(request)
  @@config["nickname"], @@config["user_name"], @@config["real_name"] = command["nickname"], command["user_name"], command["real_name"]
  @@config.save!
  @@connections.add(command)
  sleep 1
  get_update(command)
end

post "/close" do
  protected!
  content_type :json
  command = json_request(request)
  if command["target"]
    @@connections[command["connection_id"]].close(command["target"]) if @@connections.has?(command["connection_id"])
  else
    @@connections.remove(command["connection_id"])
  end
  sleep 1
  get_update(command)
end

post "/join" do
  protected!
  content_type :json
  command = json_request(request)
  @@connections[command["connection_id"]].join(command["channel"], command["param"]) if @@connections.has?(command["connection_id"])
  sleep 1
  get_update(command)
end

post "/part" do
  protected!
  content_type :json
  command = json_request(request)
  @@connections[command["connection_id"]].part(command["channel"], command["param"]) if @@connections.has?(command["connection_id"])
  sleep 1
  get_update(command)
end

post "/privmsg" do
  protected!
  content_type :json
  command = json_request(request)
  @@connections[command["connection_id"]].privmsg(command["target"], command["text"], command["action"]) if @@connections.has?(command["connection_id"])
  get_update(command)
end

post "/notice" do
  protected!
  content_type :json
  command = json_request(request)
  @@connections[command["connection_id"]].notice(command["target"], command["text"]) if @@connections.has?(command["connection_id"])
  get_update(command)
end

post "/new_window" do
  protected!
  content_type :json
  command = json_request(request)
  @@connections[command["connection_id"]].new_window(command["target"]) if @@connections.has?(command["connection_id"])
  get_update(command)
end

post "/command" do
  protected!
  content_type :json
  command = json_request(request)
  @@connections[command["connection_id"]].send(command["command"]) if @@connections.has?(command["connection_id"])
  sleep command["wait"] if command["wait"]
  get_update(command)
end

get "/all" do
  protected!
  content_type :json
  {:history => get_history({})}.to_json
end

post "/update", :agent => /Apple.*Mobile.*Safari/ do
  protected!
  content_type :json
  get_update_iphone(JSON.parse(request.env["rack.input"].read))
end

post "/update" do
  protected!
  content_type :json
  get_update(JSON.parse(request.env["rack.input"].read))
end

post "/password" do
  protected!
  command = json_request(request)
  @@config["web_user"], @@config["web_password"] = command["web_user"], command["web_password"]
  @@config.save!
  "200"
end

get "/rss" do
  content_type :rss
  @@rss_feed.to_s
end
