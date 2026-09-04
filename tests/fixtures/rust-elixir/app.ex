# Segundo archivo Elixir de la fixture D3: un CONSUMIDOR, para que el grafo
# tenga algo que resolver entre archivos (`alias`/`import` y llamadas
# calificadas por módulo).
defmodule App do
  alias Dispatcher
  alias EmailNotifier
  alias SmsNotifier

  def build_dispatcher(address, number) do
    Dispatcher.new()
    |> Dispatcher.register(EmailNotifier.new(address))
    |> Dispatcher.register(SmsNotifier.new(number))
  end

  def broadcast(dispatcher, message) do
    result = Dispatcher.dispatch(dispatcher, message)

    case result do
      %Dispatcher{stats: stats} when map_size(stats) == 0 -> 0
      %Dispatcher{stats: stats} -> map_size(stats)
    end
  end

  def run do
    dispatcher = build_dispatcher("a@b.c", "+1")
    total = broadcast(dispatcher, "hello")
    describe_total(total)
  end

  defp describe_total(0), do: 0
  defp describe_total(1), do: 1
  defp describe_total(total), do: total
end
