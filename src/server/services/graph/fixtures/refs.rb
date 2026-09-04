module Jekyll
  class Renderer
    def render(path, options = DEFAULTS)
      PathManager.join(path, "x")
      array.join(",")
      Jekyll::External.require_with_graceful_fail(path)
      foo(bar: options)
      local = path
      helper(local)
    end
  end
end
