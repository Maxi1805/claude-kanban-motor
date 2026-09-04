# POSITIVO (mutación B: sin Facade; secuencia repetida en 2 llamadores).
def checkout(order, payment, inventory, shipping, notifier):
    payment.charge(order.total)
    inventory.reserve(order.items)
    shipping.schedule(order.date)
    notifier.send_confirmation()


def checkout_express(order, payment, inventory, shipping, notifier):
    payment.charge(order.total)
    inventory.reserve(order.items)
    shipping.schedule(order.date)
    notifier.send_confirmation()
