const Url = "https://danbooru.donmai.us/posts.json?tags=score:50.. rating:g random:10 mpixels:2.5.. ratio:16:9.."
fetch(Url)
    .then(response => response.json())
    .then(data => {
        const file_url = data.sort((a, b) => b.score - a.score).map(item => item.file_url)[0]
        console.log(file_url)
        try {
            document.getElementById("page-header").style.backgroundImage = `url(${file_url})`
        } catch (e) {
            
        }
    })