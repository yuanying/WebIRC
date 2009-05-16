require "ftools"
require "yaml"

class WebIRCConfig
  HOME = "#{ENV["HOME"]}/.webirc"
  CONFIG = "#{HOME}/config.yml"
  
  def initialize
    File.makedirs(HOME) unless File.exists?(HOME)
    raise "Could not create #{HOME}" unless File.exists?(HOME)
    @config = (File.exists?(CONFIG) ? YAML::load(File.open(CONFIG).read) : Hash.new)
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
