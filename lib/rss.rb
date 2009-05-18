require "rexml/document"
require "digest/md5"
require "time"

class RSSFeed
  def initialize
    @items = Array.new
    @master = REXML::Document.new
    @master.add_element("rss", {"version" => 2.0})
    channel = add_element(@master.root, "channel")
    add_element(channel, "title", "WebIRC URI catcher")
    add_element(channel, "link", "http://github.com/andyherbert/WebIRC")
    add_element(channel, "description", "URIs caught by the WebIRC client")
  end
  
  def add_element(node, name, text = nil, encode = false, attributes = {})
    element = node.add_element(name, attributes)
    element.text = (encode ? REXML::Text.new(REXML::Text.new(text)) : text) if text
    element
  end

  def add(link, original_line, nickname, netmask, source)
    item = REXML::Element.new("item")
    now = Time.now
    add_element(item, "title", "#{source}: #{link}")
    add_element(item, "link", link)
    add_element(item, "description", "#{source}: <#{nickname}> #{original_line}", true)
    add_element(item, "pubDate", now.rfc2822)
    add_element(item, "author", "#{nickname}!#{netmask}")
    add_element(item, "guid", Digest::MD5.hexdigest("#{link}:#{original_line}:#{nickname}:#{netmask}:#{source}:#{now.to_i}"), false, {"isPermaLink" => "false"})
    @items << item
    @items.delete_at(0) if @items.length > 32
  end
  
  def to_s
    new_feed = @master.dup
    @items.reverse.each {|item| new_feed.root.elements["channel"] << item}
    "<?xml version='1.0' encoding='UTF-8' ?>\n\n#{new_feed.to_s}"
  end
end
