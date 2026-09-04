require "singleton"
class AppConfig
  include Singleton
  def initialize
    @loaded_at = Time.now
  end
end
class RequestContext
  def initialize(user_id)
    @user_id = user_id
  end
end
