module App
  module Utils
    def self.slugify(text)
      text.downcase.gsub(" ", "-")
    end
  end
end
