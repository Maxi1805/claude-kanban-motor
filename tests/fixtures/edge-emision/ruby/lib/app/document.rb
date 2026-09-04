module App
  class Document
    def initialize(config)
      @config = config
    end

    def title
      @config["title"]
    end
  end
end
