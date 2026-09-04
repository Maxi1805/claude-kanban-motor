# POSITIVO (mutación B: Decorator aplanado; acumulador con 3 capas condicionales).
def describe_shape(shape, has_color, has_border, has_shadow):
    result = shape.describe()
    if has_color:
        result = "colored(" + result + ")"
    if has_border:
        result = "bordered(" + result + ")"
    if has_shadow:
        result = "shadowed(" + result + ")"
    return result
