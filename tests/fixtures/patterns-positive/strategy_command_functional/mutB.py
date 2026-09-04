# POSITIVO (mutación B: Strategy aplanado en if/elif; cuerpos sustanciales).
class Sorter:
    def sort_by(self, items, mode):
        if mode == "asc":
            return sorted(items)
        elif mode == "desc":
            return sorted(items, reverse=True)
        elif mode == "abs":
            return sorted(items, key=lambda x: abs(x))
        return items
