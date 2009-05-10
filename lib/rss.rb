require "rexml/document"
require "digest/md5"

class RSSFeed
  def initialize
    @items = Array.new
    @master_doc = REXML::Document.new
    @master_doc.add_element("rss", {"version" => 2.0})
    channel = add_element(@master_doc.root, "channel")
    add_element(channel, "title", "WebIRC URI catcher")
    add_element(channel, "link", "http://github.com/andyherbert/WebIRC")
    add_element(channel, "description", "URIs caught by the WebIRC client")
  end
  
  def add_element(node, name, text = nil, encode = false, attributes = {})
    element = node.add_element(name, attributes)
    element.text = (encode ? REXML::Text.new(REXML::Text.new(text)) : text) if text
    element
  end

  def add(link, original_line, author, source)
    item = REXML::Element.new("item")
    now = Time.now
    add_element(item, "title", "#{source}: #{link}")
    add_element(item, "link", link)
    add_element(item, "description", "#{source}: <#{author}> #{original_line}", true)
    add_element(item, "pubDate", now.to_s)
    add_element(item, "author", author)
    add_element(item, "guid", Digest::MD5.hexdigest("#{link}:#{original_line}:#{author}:#{source}:#{now.to_i}"), false, {"isPermaLink" => "false"})
    @items << item
    @items.delete_at(0) if @items.length > 2
  end
  
  def to_s
    new_feed = @master_doc.dup
    @items.reverse.each {|item| new_feed.root << item}
    new_feed.to_s
  end
end