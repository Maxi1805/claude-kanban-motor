# Forma real de un archivo Ruby de biblioteca (estilo jekyll/lib/jekyll.rb):
# `require` por ruta de $LOAD_PATH y `require_relative` por ruta del propio archivo.
require "app/document"
require_relative "app/utils"

module App
  class Site
    def initialize(config)
      @config = config
    end

    def render
      doc = App::Document.new(@config)
      App::Utils.slugify(doc.title)
    end
  end
end
