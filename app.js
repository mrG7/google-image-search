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

    /*
    Maintain a history of requests sent for various pages in the result set.
    (*don't* assume that pages [1, 2, 3, ...] is consistent between calls, or
    that the entire page set required to satisfy maxResultCount will be in the
    initial request.

    Keys of history objects should contain

        label, start
            From page object in search api

        requestedCount
            Track how many results we have requested (avoid unneeded extra
            ajax requests on slow connections while response load)

        results, consumed
            Track results from each page to maintain ordering across pages
            when inserting for display

     */
    var history = {};

    function reqCTotal(){
        var t = 0;
        for(var k in history){
            t = t + history[k].requestedCount;
        }
        return t;
    }

    /*
    "Consume" history items that haven't been added to the collection
    of results on display. Result pages arrive asynchonously; consume will
    display any new pages of results that definitely won't require any
    insertions above them.
     */
    function consume(){
        var keys = Object.keys(history).sort();
        for(var i=0; i<keys.length; i++){

            var k = keys[i],
                v = history[k];

            if((k==1 && !v.consumed || k > 1 && history[k-1].consumed && !v.consumed) && v.results!=null){
                if(searchIndex==g.searchCount){
                    g.results.add(
                        v.results.slice(0, g.settings.maxResultCount - g.results.length)
                            .map(function(result){
                                return _.extend(result, {page: k});
                            }));
                    v.consumed = true;
                }
            }
        }
    }

    function fetch(url, callback){
        $.ajax(
            {
                url: url,
                dataType: 'jsonp',
                success: function(data) {

                    if(data.responseData){

                        var results = data.responseData.results,
                            cursor = data.responseData.cursor,
                            pages = cursor.pages,
                            stats = {};

                        if(results.length > 0){
                            stats.totalResultsEstimate = cursor.estimatedResultCount;
                            history[cursor.currentPageIndex+1].results = results;

                            pages.forEach(function(page){
                                if(history[page.label]==null && reqCTotal() < g.settings.maxResultCount){
                                    requests.push({url: g.updateQueryParam(url, 'start', page.start)});
                                    history[page.label] = _.extend(page, {requestedCount:g.settings.pageSize, results: null, consumed: false});
                                }
                            });
                        } else {
                            stats.totalResultsEstimate = 0;
                        }

                        callback(undefined, stats);
                    }

                },
                complete: function(){
                    consume();
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
                fetch(task.url, function(err, stats){
                    //todo: error handling
                    g.updateStats(stats);
                });
            }
        },
        g.settings.maxConcurrentRequests
    );

    //invalidate any previous results on display
    g.results.reset();
    $('#results').html('');

    history[1] = _.extend({label: 1, start: 0, requestedCount: g.settings.pageSize, results: null, consumed: false});
    requests.push(
        {
            url: g.updateQueryParam(g.settings.searchEndpoint, 'q', query)
        }
    );
}

g.newSearch = _.debounce(
    function(){
        g.updateStats();
        var query = $('#input-query').val()
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
