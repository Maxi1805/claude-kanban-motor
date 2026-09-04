class AppConfig:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
class RequestContext:
    def __init__(self, user_id):
        self.user_id = user_id
