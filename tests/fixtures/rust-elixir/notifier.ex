# Fixture D3 (Ola 11b) — Elixir real: un behaviour con `__using__`, dos módulos
# que lo adoptan con `use`/`@behaviour`, funciones con guardas y cláusulas
# múltiples, `case`/`cond`, y un despachador que recorre una lista invocando a
# cada elemento. Sirve para ver qué deriva el pipeline SIN una sola entrada de
# léxico por lenguaje.
defmodule Notifier do
  @callback notify(String.t()) :: String.t()
  @callback channel() :: String.t()

  defmacro __using__(_opts) do
    quote do
      @behaviour Notifier

      def channel do
        "generic"
      end

      defoverridable channel: 0
    end
  end
end

defmodule EmailNotifier do
  use Notifier

  defstruct address: "", retries: 3

  def new(address) when is_binary(address) do
    %EmailNotifier{address: address}
  end

  def envelope(%EmailNotifier{address: address}, message) do
    "<" <> address <> "> " <> message
  end

  def notify(%EmailNotifier{} = notifier, message) do
    body = envelope(notifier, message)

    Enum.reduce(1..notifier.retries, body, fn attempt, acc ->
      if attempt == notifier.retries do
        acc <> " (last)"
      else
        acc
      end
    end)
  end

  def channel, do: "email"
end

defmodule SmsNotifier do
  use Notifier

  defstruct number: "", retries: 1

  def new(number) when is_binary(number) do
    %SmsNotifier{number: number}
  end

  def envelope(%SmsNotifier{number: number}, message) do
    "[" <> number <> "] " <> message
  end

  def notify(%SmsNotifier{} = notifier, message) do
    body = envelope(notifier, message)

    Enum.reduce(1..notifier.retries, body, fn attempt, acc ->
      if attempt == notifier.retries do
        acc <> " (last)"
      else
        acc
      end
    end)
  end

  def channel, do: "sms"
end

defmodule Dispatcher do
  defstruct notifiers: [], stats: %{}

  def new do
    %Dispatcher{}
  end

  def register(%Dispatcher{notifiers: notifiers} = dispatcher, notifier) do
    %Dispatcher{dispatcher | notifiers: [notifier | notifiers]}
  end

  def dispatch(%Dispatcher{notifiers: notifiers} = dispatcher, message) do
    Enum.reduce(notifiers, dispatcher, fn notifier, acc ->
      body = notifier.__struct__.notify(notifier, message)

      case body do
        "" -> acc
        _ -> bump(acc, notifier.__struct__.channel())
      end
    end)
  end

  defp bump(%Dispatcher{stats: stats} = dispatcher, channel) do
    %Dispatcher{dispatcher | stats: Map.update(stats, channel, 1, &(&1 + 1))}
  end

  def describe(kind) do
    cond do
      kind == "email" -> "email channel"
      kind == "sms" -> "sms channel"
      kind == "push" -> "push channel"
      true -> "unknown channel"
    end
  end

  def risky(n) do
    try do
      if n > 100 do
        raise("too big")
      else
        n
      end
    rescue
      e in RuntimeError -> {:error, Exception.message(e)}
    end
  end
end
