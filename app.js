/*
Google Image Search Web-client
by Dave Trindall <dave.trindall@gmail.com>
 */

//namespace for app (single letter: less entropy, more readability)
var g = {

    //namespace for settings, avoid magic numbers throughout code.
    settings: {},

    //app state
    searchCount: 0
};

g.settings.maxResultCount = 50;
g.settings.maxConcurrentRequests = 4;
g.settings.pageSize = 8;
g.settings.instantSearchDelay = 300;
g.settings.searchEndpoint =
    'https://ajax.googleapis.com/ajax/services/search/images?v=1.0&rsz=' + g.settings.pageSize;

//from http://stackoverflow.com/a/6021027/193601
g.updateQueryParam = function(uri, key, value) {
    var re = new RegExp("([?|&])" + key + "=.*?(&|$)", "i");
    var separator = uri.indexOf('?') !== -1 ? "&" : "?";
    if (uri.match(re)) {
        return uri.replace(re, '$1' + key + "=" + value + '$2');
    }
    else {
        return uri + separator + key + "=" + value;
    }
}

/*
    searchIndex
        1 based index that increments by 1 for each search performed by user
 */
g.runSearch = function(searchIndex, query){

    var oBuffer = new gUtils.OrderingBuffer(
        function isNext(a, b){
            if(a==null && b.label==1 || a && b.label== a.label+1){
                return true;
            }
        },
        function callback(err, next){
            if(searchIndex==g.searchCount){
                console.log('obuff callback');
                g.results.add(
                    next.results.slice(0, g.settings.maxResultCount - g.results.length)
                        .map(function(result){
                            return _.extend(result, {page: next.label});
                        }
                    )
                );
            }
        }
    )

    function fetch(url, pageNumber, callback){
        console.log(url);
        $.ajax(
            {
                url: url,
                dataType: 'jsonp',
                success: function(data) {
                    if(data.responseData){
                        var results = data.responseData.results,
                            cursor = data.responseData.cursor,
                            stats = {};
                        if(results.length > 0){
                            stats.totalResultsEstimate = cursor.estimatedResultCount;
                            oBuffer.add({label: pageNumber, results: results});
                        } else {
                            stats.totalResultsEstimate = 0;
                        }
                        callback(undefined, stats);
                    }
                }
            }
        );
    }

    /*
    Use a queue with max concurrent requests to load requests
    without going crazy (old browsers, browser concurrent XHR requests etc.)
     */
    var requests = async.queue(
        function (task, callback) {
            if(searchIndex==g.searchCount){
                fetch(task.url, task.page, function(err, stats){
                    stats.error = err;
                    g.updateStats(stats);
                });
            }
        },
        g.settings.maxConcurrentRequests
    );

    //invalidate any previous results on display
    g.results.reset();
    $('#results').html('');

    var urlWithQuery = g.updateQueryParam(g.settings.searchEndpoint, 'q', query);
    for(var i=0, p=1; i < g.settings.maxResultCount; i += g.settings.pageSize, p++){
        requests.push({url: g.updateQueryParam(urlWithQuery, 'start', i), page: p});
    }
}

g.newSearch = _.debounce(
    function(){
        g.updateStats();
        var query = $('#input-query').val();
        g.runSearch(++g.searchCount, query);
    },
    g.settings.instantSearchDelay
)

g.updateStats = function(stats){
    var stats = stats || {},
        totalResults = stats.totalResultsEstimate || 'no';

    $('#result-count').html(totalResults.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' results.');
}

g.appView = Backbone.View.extend({
    el: $('#container'),
    template: _.template($('#main-template').html()),
    initialize: function() {
        g.results.on('add', this.addResult, this);
        this.render();
    },
    addResult: function(result){
        var view = new g.ResultView({model: result});
        $('#results').append(view.render().el);
    },
    render: function(){
        this.$el.html(this.template());
    }
});

g.Result = Backbone.Model.extend({

    //What page in the api result did this come from?
    page: -1,

    //used names from the API (https://developers.google.com/image-search/v1/jsondevguide)
    tbUrl: null,
    url: null

});

g.ResultView = Backbone.View.extend({
    tagName: 'div',
    className: 'result',
    template: _.template($('#result-template').html()),
    render: function(){
        this.$el.html(this.template(this.model.toJSON()));
        return this;
    }
});

g.Results = Backbone.Collection.extend({
    model: g.Result
});

g.results = new g.Results();
var appView = new g.appView();

//bind to inputs
$('#input-query').keyup(function(event){
    g.newSearch();
});
