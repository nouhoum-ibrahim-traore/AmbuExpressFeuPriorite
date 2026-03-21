sudo tee /var/www/momentum/index.php > /dev/null << 'EOF'
<?php
// Configuration base de données VM4
$db_host = '192.168.1.13';
$db_name = 'momentum_db';
$db_user = 'momentum';
$db_pass = 'password123';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die("Erreur DB: " . $e->getMessage());
}

// Traitement formulaire
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['image'])) {
    $text = $_POST['text'] ?? '';
    $image_tmp = $_FILES['image']['tmp_name'];
    $image_type = $_FILES['image']['type'];
    
    // Conversion Base64
    $image_data = base64_encode(file_get_contents($image_tmp));
    $image_base64 = "data:$image_type;base64,$image_data";
    
    $stmt = $pdo->prepare("INSERT INTO entries (image_path, image_base64, text_content) VALUES (?, ?, ?)");
    $stmt->execute([$_FILES['image']['name'], $image_base64, $text]);
    
    header('Location: /');
    exit;
}

// Récupérer entrées
$entries = $pdo->query("SELECT * FROM entries ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Momentum Clone</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;color:white}
        .container{max-width:1200px;margin:0 auto;padding:20px}
        h1{text-align:center;font-size:3em;margin-bottom:30px;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
        .form-section,.carousel-section{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:30px;margin-bottom:40px}
        .form-group{margin-bottom:20px}
        label{display:block;margin-bottom:8px;font-weight:600}
        input[type="file"],textarea{width:100%;padding:12px;border:none;border-radius:10px;background:rgba(255,255,255,0.9);color:#333}
        textarea{min-height:100px;resize:vertical}
        button{background:#ff6b6b;color:white;border:none;padding:15px 40px;font-size:1.1em;border-radius:30px;cursor:pointer;transition:transform 0.3s}
        button:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(0,0,0,0.2)}
        .carousel-container{position:relative;overflow:hidden;border-radius:15px;box-shadow:0 20px 40px rgba(0,0,0,0.3);background:#000}
        .carousel-slide{display:none;animation:fadeIn 0.8s}
        .carousel-slide.active{display:block}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .slide-image{width:100%;height:500px;object-fit:contain;display:block}
        .slide-content{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.8),transparent);padding:40px}
        .slide-text{font-size:1.5em;line-height:1.6;text-shadow:1px 1px 2px rgba(0,0,0,0.5)}
        .arrow-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.2);border:none;color:white;font-size:2em;padding:20px;cursor:pointer;z-index:10}
        .arrow-btn:hover{background:rgba(255,255,255,0.4)}
        .prev{left:20px}
        .next{right:20px}
        .server-info{position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.5);padding:10px 20px;border-radius:20px;font-size:0.9em}
        .nav-btn{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,0.5);border:none;cursor:pointer;margin:0 5px}
        .nav-btn.active{background:white}
        .carousel-nav{display:flex;justify-content:center;margin-top:20px}
    </style>
</head>
<body>
    <div class="server-info">Serveur: <?=gethostname()?> | IP: <?=$_SERVER['SERVER_ADDR']?></div>
    
    <div class="container">
        <h1>✨ Mon Momentum</h1>
        
        <div class="form-section">
            <h2>Ajouter une inspiration</h2>
            <form method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Choisir une image :</label>
                    <input type="file" name="image" accept="image/*" required>
                </div>
                <div class="form-group">
                    <label>Votre texte :</label>
                    <textarea name="text" placeholder="Entrez votre texte inspirant..." required></textarea>
                </div>
                <button type="submit">Ajouter au Carousel</button>
            </form>
        </div>
        
        <div class="carousel-section">
            <h2>Vos Inspirations</h2>
            <?php if(count($entries)>0): ?>
            <div class="carousel-container">
                <button class="arrow-btn prev" onclick="changeSlide(-1)">❮</button>
                <button class="arrow-btn next" onclick="changeSlide(1)">❯</button>
                <?php foreach($entries as $i=>$e): ?>
                <div class="carousel-slide <?=($i===0)?'active':''?>" data-index="<?=$i?>">
                    <img src="<?=$e['image_base64']?>" class="slide-image">
                    <div class="slide-content">
                        <p class="slide-text"><?=nl2br(htmlspecialchars($e['text_content']))?></p>
                        <p style="opacity:0.8;margin-top:10px">Ajouté le <?=date('d/m/Y H:i',strtotime($e['created_at']))?></p>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
            <div class="carousel-nav">
                <?php for($i=0;$i<count($entries);$i++): ?>
                <button class="nav-btn <?=($i===0)?'active':''?>" onclick="goToSlide(<?=$i?>)"></button>
                <?php endfor; ?>
            </div>
            <?php else: ?>
            <p style="text-align:center;padding:60px">Aucune inspiration encore. Ajoutez votre première !</p>
            <?php endif; ?>
        </div>
    </div>

    <script>
        let currentSlide=0;
        const slides=document.querySelectorAll('.carousel-slide');
        const dots=document.querySelectorAll('.nav-btn');
        function showSlide(i){if(!slides.length)return;slides.forEach(s=>s.classList.remove('active'));dots.forEach(d=>d.classList.remove('active'));if(slides[i]){slides[i].classList.add('active');if(dots[i])dots[i].classList.add('active');currentSlide=i;}}
        function changeSlide(d){if(!slides.length)return;let n=currentSlide+d;if(n>=slides.length)n=0;if(n<0)n=slides.length-1;showSlide(n);}
        function goToSlide(i){showSlide(i);}
        setInterval(()=>{if(slides.length>1)changeSlide(1);},5000);
    </script>
</body>
</html>
EOF