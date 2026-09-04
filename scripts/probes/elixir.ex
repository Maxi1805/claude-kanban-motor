defmodule Shape do
  @callback area(term) :: float

  defmacro __using__(_opts) do
    quote do
      @behaviour Shape
    end
  end
end

defmodule Circle do
  use Shape
  @behaviour Shape

  defstruct radius: 0.0, label: "circle"

  def new(radius, label) do
    %Circle{radius: radius, label: label}
  end

  def area(%Circle{radius: r}) when r > 0 do
    3.14 * r * r
  end

  def area(_), do: 0.0

  def describe(kind) do
    case kind do
      "circle" -> "circle"
      "square" -> "square"
      _ -> "unknown"
    end
  end

  def classify(n) do
    cond do
      n > 10 -> :big
      n > 0 -> :small
      true -> :none
    end
  end

  def loopy(items) do
    total =
      Enum.reduce(items, 0, fn item, acc ->
        if item > 0 do
          acc + item
        else
          acc - item
        end
      end)

    doubled = for item <- items, item > 0, do: item * 2

    try do
      risky(total)
    rescue
      e in RuntimeError -> {:error, e}
    after
      length(doubled)
    end
  end

  defp risky(n) when is_integer(n) do
    if n > 100 do
      raise("too big")
    else
      n
    end
  end
end
