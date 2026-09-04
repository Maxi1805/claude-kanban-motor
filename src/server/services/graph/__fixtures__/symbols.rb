module Admin
  class DealPolicy
    STATUS = "open"

    def initialize(user)
      @user = user
      total = 0
      total
    end

    def edit?
      true
    end
  end
end

module Helper
  def self.build
    new
  end
end

module Errors
  class FatalError < StandardError
  end

  class RenderError < StandardError
  end
end

TOP_LEVEL = 1

def standalone(x)
  x
end
