class Shape
  def initialize(color, x, y)
    @color = color
    @x = x
    @y = y
  end
  def clone
    Shape.new(@color, @x, @y)
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
class Shape2
  def initialize(color, x, y)
    @color = color
    @x = x
    @y = y
  end
  def clone
    Shape2.new(@color, @x, @y)
  end
end

