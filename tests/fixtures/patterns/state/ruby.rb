# Fixture canónica: State ya aplicado (Ruby). Cada estado es su propia
# clase con la misma interfaz (`next`); el contexto solo reasigna @state,
# sin ningún if/elsif sobre él repartido en varios métodos.
class TrafficLight
  def initialize
    @state = RedState.new
  end

  def advance!
    @state = @state.next
  end

  def force_state(state)
    @state = state
  end
end

class RedState
  def next
    GreenState.new
  end
end

class GreenState
  def next
    YellowState.new
  end
end

class YellowState
  def next
    RedState.new
  end
end
