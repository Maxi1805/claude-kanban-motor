class Subject
  def initialize
    @observers = []
  end
  def attach(observer)
    @observers << observer
  end
  def notify_all(event)
    @observers.each { |observer| observer.update(event) }
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
class Subject2
  def initialize
    @observers = []
  end
  def attach(observer)
    @observers << observer
  end
  def notify_all(event)
    @observers.each { |observer| observer.update(event) }
  end
end

