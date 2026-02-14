require('./ai.css')

module.exports = angular.module('stf.ai-pane', [
  require('stf/ai-tasks').name,
  require('stf/util/common').name
])
  .run(['$templateCache', function($templateCache) {
    $templateCache.put('control-panes/ai/ai.pug',
      require('./ai.pug')
    )
  }])
  .controller('AiPaneCtrl', require('./ai-controller'))
