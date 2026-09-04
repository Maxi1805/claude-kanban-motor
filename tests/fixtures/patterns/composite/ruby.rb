# Fixture canónica: Composite (Ruby, sin anotaciones de tipo).
# Positivo: ShapeGroup contiene una COLECCIÓN de la propia familia (Shape) y
# la itera invocando el MISMO mensaje ("render") sobre cada elemento.
class ShapeGroup < Shape
  def initialize
    @children = []
  end

  def add(child)
    @children << child
  end

  def render
    @children.each { |c| c.render }
  end
end

# Control negativo: colección real, pero de un tipo AJENO a la propia
# familia, iterada para hacer otra cosa (sumar), no para invocar el mismo
# mensaje — no debe reconocerse como Composite.
class Invoice
  def initialize
    @items = []
  end

  def add_item(price)
    @items << price
  end

  def total
    sum = 0
    @items.each { |price| sum += price }
    sum
  end
end
