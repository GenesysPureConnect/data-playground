local({
old <- getOption("defaultPackages"); r <- getOption("repos")
options(defaultPackages = c(old, "jsonlite"), repos = r)
options(width=180)
})

.First <- function(){
 cat("<b>Welcome to RPureCloud. Embrace the data. Love the data. Be the data.</b>\n")
}

setHook(packageEvent("grDevices", "onLoad"),
        function(...) grDevices::png("plot.png", 1024, 1024))
