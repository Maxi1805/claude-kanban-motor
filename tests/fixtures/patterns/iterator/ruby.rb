# Fixture canónica: Iterator / protocolo conocido (Ruby: `each`).
class NumberCollection
  def initialize(numbers)
    @numbers = numbers
  end

  def each
    @numbers.each { |n| yield n }
  end
end

# Control negativo: nombre de método parecido ("next_page"), pero NO
# coincide con el protocolo fijo de Ruby (`each`, o `next`+`peek`).
class Paginator
  def next_page
    @page += 1
  end
end
