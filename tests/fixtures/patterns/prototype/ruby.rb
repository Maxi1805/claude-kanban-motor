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
