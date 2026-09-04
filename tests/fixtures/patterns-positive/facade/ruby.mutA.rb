class OrderFacade
  def initialize(payment, inventory, shipping, notifier)
    @payment = payment
    @inventory = inventory
    @shipping = shipping
    @notifier = notifier
  end

  def process(order)
    @payment.charge(order.total)
    @inventory.reserve(order.items)
    @shipping.schedule(order.date)
    @notifier.send_confirmation
  end
end


# --- POSITIVO (mutacion A: clone-duplicate) ---
class OrderFacade2
  def initialize(payment, inventory, shipping, notifier)
    @payment = payment
    @inventory = inventory
    @shipping = shipping
    @notifier = notifier
  end

  def process(order)
    @payment.charge(order.total)
    @inventory.reserve(order.items)
    @shipping.schedule(order.date)
    @notifier.send_confirmation
  end
end

