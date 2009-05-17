require "ftools"
require "yaml"

class WebIRCConfig
  HOME = "#{ENV["HOME"]}/.webirc"
  CONFIG = "#{HOME}/config.yml"
  PUBLIC = "#{HOME}/public"
  
  def initialize
    File.makedirs(HOME) unless File.exists?(HOME)
    raise "Could not create #{HOME}" unless File.exists?(HOME)
    @config = (File.exists?(CONFIG) ? YAML::load(File.open(CONFIG).read) : Hash.new)
  end
  
  def save_file(filename)
    File.makedirs(PUBLIC) unless File.exists?(PUBLIC)
    raise "Could not create #{PUBLIC}" unless File.exists?(PUBLIC)
    File.open("#{PUBLIC}/#{filename}", "w") {|file| yield file if block_given?}
  end
  
  def exists?(filename)
    File.exists?("#{PUBLIC}/#{filename}")
  end
  
  def get_file(filename)
    File.open("#{PUBLIC}/#{filename}", "r") {|file| yield file if block_given?}
  end
  
  def [](key)
    @config[key]
  end
  
  def []=(key, value)
    @config[key] = value
  end
  
  def save!
    begin
      File.open(CONFIG, "w") {|file| file.write(YAML::dump(@config))}
    rescue Exception => e
      puts "An error occured whist attampting to write value #{value} to the key #{key} in #{CONFIG}"
    end
  end
end
