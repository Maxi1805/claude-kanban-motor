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


# --- POSITIVO (mutacion A: clone-duplicate) ---
# Fixture canónica: State ya aplicado (Ruby). Cada estado es su propia
# clase con la misma interfaz (`next`); el contexto solo reasigna @state,
# sin ningún if/elsif sobre él repartido en varios métodos.
class TrafficLight2
  def initialize
    @state = RedState2.new
  end

  def advance!
    @state = @state.next
  end

  def force_state(state)
    @state = state
  end
end

class RedState2
  def next
    GreenState2.new
  end
end

class GreenState2
  def next
    YellowState2.new
  end
end

class YellowState2
  def next
    RedState2.new
  end
end

