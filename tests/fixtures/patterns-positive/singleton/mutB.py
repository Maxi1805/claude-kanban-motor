class AppConfig:
    _instance = None

    def __init__(self):
        self.loaded_at = None

    @staticmethod
    def get_instance():
        if AppConfig._instance is None:
            AppConfig._instance = AppConfig()
        return AppConfig._instance


# POSITIVO (mutación B: fuga de construcción). get_instance() sigue ahí, pero
# estos dos sitios construyen AppConfig directamente en vez de pasar por él.
def boot_startup():
    return AppConfig()


def boot_worker():
    return AppConfig()
