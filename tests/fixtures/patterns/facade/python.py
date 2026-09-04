class OrderFacade:
    def __init__(self, payment, inventory, shipping, notifier):
        self.payment = payment
        self.inventory = inventory
        self.shipping = shipping
        self.notifier = notifier

    def process(self, order):
        self.payment.charge(order.total)
        self.inventory.reserve(order.items)
        self.shipping.schedule(order.date)
        self.notifier.send_confirmation()
