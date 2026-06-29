"use strict";
//Menu dos objetos
const catalogoModelos = [
    { nome: "Flor (3 pétalas)", arquivo: "objetos/Flower_3_Group.obj" },
    { nome: "Caminho de Pedra", arquivo: "objetos/RockPath_Round_Wide.obj" },
    { nome: "Grama", arquivo: "objetos/Grass_Common_Short.obj" },
    { nome: "Árvore Comum", arquivo: "objetos/CommonTree_1.obj" },
    { nome: "Arbusto com Flores", arquivo: "objetos/Bush_Common_Flowers.obj" },
    { nome: "Pinheiro", arquivo: "objetos/Pine_1.obj" },
    { nome: "Árvore Torcida", arquivo: "objetos/TwistedTree_4.obj" },
    
    
];
//Textura que pode trocar
const texturasAlternativasPorModelo = {
    "objetos/TwistedTree_4.obj": [
        { nome: "Tronco padrão", arquivo: "Bark_TwistedTree.png", materialAlvo: "Bark_TwistedTree" },
        { nome: "Tronco diferente", arquivo: "Bark_NormalTree.png", materialAlvo: "Bark_TwistedTree" },
    ],
    "objetos/CommonTree_1.obj": [
        { nome: "Tronco padrão", arquivo: "Bark_NormalTree.png", materialAlvo: "Bark_NormalTree" },
        { nome: "Tronco diferente", arquivo: "Bark_TwistedTree.png", materialAlvo: "Bark_NormalTree" },
    ],
    "objetos/RockPath_Round_Wide.obj": [
        { nome: "Padrão (Pedra)", arquivo: "Rocks_Diffuse.png" },
        { nome: "Deserto", arquivo: "Rocks_Desert_Diffuse.png" },
    ],
};
// Lista de instâncias na cena.

let cena = [];

// Cache de modelos já carregados na GPU, não duplica a malha.
let modelos3D = {};

let objetoSelecionadoIndex = -1;

// Arquivos .obj
function parseOBJ(text) {
    const objPositions = [[0, 0, 0]];
    const objTexcoords = [[0, 0]];
    const objNormals = [[0, 0, 0]];
    const objColors = [[0, 0, 0]];

    const objVertexData = [objPositions, objTexcoords, objNormals, objColors];
    let webglVertexData = [[], [], [], []];

    const materialLibs = [];
    const geometries = [];
    let geometry;
    let groups = ['default'];
    let material = 'default';
    let object = 'default';

    const noop = () => {};

    function newGeometry() {
        if (geometry && geometry.data.position.length) {
            geometry = undefined;
        }
    }

    function setGeometry() {
        if (!geometry) {
            const position = [];
            const texcoord = [];
            const normal = [];
            const color = [];
            webglVertexData = [position, texcoord, normal, color];
            geometry = {
                object,
                groups,
                material,
                data: { position, texcoord, normal, color },
            };
            geometries.push(geometry);
        }
    }

    function addVertex(vert) {
        const ptn = vert.split('/');
        ptn.forEach((objIndexStr, i) => {
            if (!objIndexStr) return;
            const objIndex = parseInt(objIndexStr);
            const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
            webglVertexData[i].push(...objVertexData[i][index]);
            if (i === 0 && objColors.length > 1) {
                geometry.data.color.push(...objColors[index]);
            }
        });
    }

    const keywords = {
        v(parts) {
            if (parts.length > 3) {
                objPositions.push(parts.slice(0, 3).map(parseFloat));
                objColors.push(parts.slice(3).map(parseFloat));
            } else {
                objPositions.push(parts.map(parseFloat));
            }
        },
        vn(parts) {
            objNormals.push(parts.map(parseFloat));
        },
        vt(parts) {
            objTexcoords.push(parts.map(parseFloat));
        },
        f(parts) {
            setGeometry();
            const numTriangles = parts.length - 2;
            for (let tri = 0; tri < numTriangles; ++tri) {
                addVertex(parts[0]);
                addVertex(parts[tri + 1]);
                addVertex(parts[tri + 2]);
            }
        },
        s: noop,
        mtllib(parts, unparsedArgs) {
            materialLibs.push(unparsedArgs);
        },
        usemtl(parts, unparsedArgs) {
            material = unparsedArgs;
            newGeometry();
        },
        g(parts) {
            groups = parts;
            newGeometry();
        },
        o(parts, unparsedArgs) {
            object = unparsedArgs;
            newGeometry();
        },
    };

    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
        const line = lines[lineNo].trim();
        if (line === '' || line.startsWith('#')) continue;
        const m = keywordRE.exec(line);
        if (!m) continue;
        const [, keyword, unparsedArgs] = m;
        const parts = line.split(/\s+/).slice(1);
        const handler = keywords[keyword];
        if (!handler) continue;
        handler(parts, unparsedArgs);
    }

    for (const geometry of geometries) {
        geometry.data = Object.fromEntries(
            Object.entries(geometry.data).filter(([, array]) => array.length > 0));
    }

    return { geometries, materialLibs };
}

// Arquivos .mtl 
function extrairNomeDeArquivo(caminho) {
    return caminho.trim().split(/[\\/]/).pop();
}

function parseMTL(text) {
    const materials = {};
    let material;

    const keywords = {
        newmtl(parts, unparsedArgs) {
            material = {};
            materials[unparsedArgs] = material;
        },
        Ns(parts) { material.shininess = parseFloat(parts[0]); },
        Ka(parts) { material.ambient = parts.map(parseFloat); },
        Kd(parts) { material.diffuse = parts.map(parseFloat); },
        Ks(parts) { material.specular = parts.map(parseFloat); },
        Ke(parts) { material.emissive = parts.map(parseFloat); },
        map_Kd(parts, unparsedArgs) { material.diffuseMap = extrairNomeDeArquivo(unparsedArgs); },
        map_Ns(parts, unparsedArgs) { material.specularMap = extrairNomeDeArquivo(unparsedArgs); },
        map_Bump(parts, unparsedArgs) { material.normalMap = extrairNomeDeArquivo(unparsedArgs); },
        Ni(parts) { material.opticalDensity = parseFloat(parts[0]); },
        d(parts) { material.opacity = parseFloat(parts[0]); },
        illum(parts) { material.illum = parseInt(parts[0]); },
    };

    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
        const line = lines[lineNo].trim();
        if (line === '' || line.startsWith('#')) continue;
        const m = keywordRE.exec(line);
        if (!m) continue;
        const [, keyword, unparsedArgs] = m;
        const parts = line.split(/\s+/).slice(1);
        const handler = keywords[keyword];
        if (!handler) continue;
        handler(parts, unparsedArgs);
    }

    return materials;
}

// Bora renderizar
let gl;
let meshProgramInfo;
let canvas;
let texturaBranca = null;

// Carregar a textura manualmente
// Cria a textura usando a API nativa do WebGL2, esperando o carregamento
function carregarTexturaManual(url) {
    return new Promise((resolve) => {
        const imagem = new Image();
        imagem.crossOrigin = "anonymous";
        imagem.onload = () => {
            const textura = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, textura);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            resolve(textura);
        };
        imagem.onerror = () => {
            console.error("Não foi possível carregar a textura:", url);
            resolve(texturaBranca);
        };
        imagem.src = url;
    });
}

// Troca a textura do tronco ou das pedras
async function trocarTexturaDoObjetoSelecionado(nomeArquivoTextura, materialAlvo) {
    if (objetoSelecionadoIndex === -1 || !cena[objetoSelecionadoIndex]) return;

    const objeto = cena[objetoSelecionadoIndex];
    const modelo = modelos3D[objeto.modelo];
    if (!modelo) return;

    const baseHref = new URL(objeto.modelo, window.location.href);
    const textureHref = new URL(nomeArquivoTextura, baseHref).href;
    const novaTextura = await carregarTexturaManual(textureHref);

    // Garante que o objeto tem onde guardar a textura (caso venha de um save antigo)
    if (!objeto.texturasCustomizadas) objeto.texturasCustomizadas = {};

    let aplicou = false;

    modelo.partes.forEach((parte) => {
        const afetaEstaParte = materialAlvo
            ? (parte.nomeMaterial === materialAlvo)
            : true;

        if (afetaEstaParte) {
            // O SEGREDO ESTÁ AQUI: Salvamos a textura apenas para ESTA instância!
            objeto.texturasCustomizadas[parte.nomeMaterial] = novaTextura;
            aplicou = true;
        }
    });

    if (!aplicou) {
        console.error("ERRO: Nenhuma textura foi trocada. Verifique o materialAlvo.");
    }

    desenharCena();
}

// Carregao modelo (.obj + .mtl + texturas) pra gpu
// Usa twgl para criar buffers/VAOs, e carregamento manual para texturas.
async function carregarModelo(nomeFicheiro) {
    if (modelos3D[nomeFicheiro]) return modelos3D[nomeFicheiro];

    const resposta = await fetch(nomeFicheiro);
    if (!resposta.ok) throw new Error("Ficheiro não encontrado: " + nomeFicheiro);
    const texto = await resposta.text();

    const obj = parseOBJ(texto);
    const baseHref = new URL(nomeFicheiro, window.location.href);

    // Carrega o(s) .mtl referenciado(s) pelo .obj
    const matTexts = await Promise.all(obj.materialLibs.map(async (filename) => {
        const matHref = new URL(filename, baseHref).href;
        const matResposta = await fetch(matHref);
        if (!matResposta.ok) {
            console.warn("MTL não encontrado:", matHref);
            return "";
        }
        return await matResposta.text();
    }));
    const materials = parseMTL(matTexts.join('\n'));

    // Cache de texturas local a este modelo, para não recriar a mesma textura
    // duas vezes se dois materiais do mesmo .obj usarem a mesma imagem.
    const texturas = {};
    const tarefasDeTextura = [];

    for (const material of Object.values(materials)) {
        Object.entries(material)
            .filter(([key]) => key.endsWith('Map'))
            .forEach(([key, filename]) => {
                if (!texturas[filename]) {
                    const textureHref = new URL(filename, baseHref).href;
                    texturas[filename] = carregarTexturaManual(textureHref);
                }
                tarefasDeTextura.push(
                    texturas[filename].then((textura) => { material[key] = textura; })
                );
            });
    }

    await Promise.all(tarefasDeTextura);

    const defaultMaterial = {
        diffuse: [0.8, 0.8, 0.8],
        diffuseMap: texturaBranca,
        ambient: [0, 0, 0],
        specular: [1, 1, 1],
        shininess: 100,
        opacity: 1,
    };

    // Para cada geometria (grupo de material) do .obj, cria buffer + VAO.
    const partes = obj.geometries.map(({ material: nomeMaterial, data }) => {
        if (data.color) {
            if (data.position.length === data.color.length) {
                data.color = { numComponents: 3, data: data.color };
            }
        } else {
            data.color = { value: [1, 1, 1, 1] };
        }

        const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
        const vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);

        return {
            nomeMaterial: nomeMaterial,
            material: { ...defaultMaterial, ...materials[nomeMaterial] },
            bufferInfo,
            vao,
        };
    });

    // Calcula a "caixa" (extents) do modelo
    function getExtents(positions) {
        const min = positions.slice(0, 3);
        const max = positions.slice(0, 3);
        for (let i = 3; i < positions.length; i += 3) {
            for (let j = 0; j < 3; ++j) {
                const v = positions[i + j];
                min[j] = Math.min(v, min[j]);
                max[j] = Math.max(v, max[j]);
            }
        }
        return { min, max };
    }

    function getGeometriesExtents(geometries) {
        return geometries.reduce(({ min, max }, { data }) => {
            const minMax = getExtents(data.position);
            return {
                min: min.map((m, ndx) => Math.min(minMax.min[ndx], m)),
                max: max.map((m, ndx) => Math.max(minMax.max[ndx], m)),
            };
        }, {
            min: Array(3).fill(Number.POSITIVE_INFINITY),
            max: Array(3).fill(Number.NEGATIVE_INFINITY),
        });
    }

    const extents = getGeometriesExtents(obj.geometries);
    const range = m4.subtractVectors(extents.max, extents.min);
    // objOffset: deslocamento para centralizar o modelo na origem (0,0,0)
    const objOffset = m4.scaleVector(
        m4.addVectors(extents.min, m4.scaleVector(range, 0.5)),
        -1
    );
    const raioAproximado = m4.length(range) * 0.5;

    modelos3D[nomeFicheiro] = { partes, objOffset, raioAproximado };
    return modelos3D[nomeFicheiro];
}

// Adiciona um objeto na cena
async function adicionarObjetoNaCena(nomeVisivel, nomeFicheiro) {
    await carregarModelo(nomeFicheiro);

    const quantasJaExistem = cena.filter(o => o.id.startsWith(nomeVisivel)).length;
    const nomeFinal = quantasJaExistem === 0 ? nomeVisivel : `${nomeVisivel} ${quantasJaExistem + 1}`;

    const novoObjeto = {
        id: nomeFinal,
        modelo: nomeFicheiro,
        posicao: [0, 0, -5],
        rotacao: [0, 0, 0],
        escala: 1,
        texturasCustomizadas: {},
        // Hierarquia e Animação
        parentId: -1, 
        animar: false,
        animEixo: 'y',
        animVelocidade: 20 // positivo gira pra um lado, negativo pro outro
    };

    cena.push(novoObjeto);
    atualizarListaDropdown();

    objetoSelecionadoIndex = cena.length - 1;
    document.getElementById("item-list").value = objetoSelecionadoIndex;
    sincronizarControlesComObjetoSelecionado();

    console.log(nomeFinal + " foi adicionado à cena com sucesso!");
}

function atualizarListaDropdown() {
    const select = document.getElementById("item-list");
    const parentSelect = document.getElementById("parent-select");
    
    // Guarda na memória o que estava selecionado antes de recarregar a lista
    const selecionadoAtual = select.value;
    const paiAtual = parentSelect ? parentSelect.value : "-1";

    select.innerHTML = "";
    if (parentSelect) parentSelect.innerHTML = '<option value="-1">Nenhum (Solto no Mundo)</option>';

    cena.forEach((objeto, index) => {
        // Lista principal
        const option = document.createElement("option");
        option.value = index;
        option.text = objeto.id;
        select.appendChild(option);

        // Lista de Pais
        if (parentSelect) {
            const parentOption = document.createElement("option");
            parentOption.value = index;
            parentOption.text = objeto.id;
            parentSelect.appendChild(parentOption);
        }
    });

    // Devolve a seleção para a interface
    if (selecionadoAtual !== "") select.value = selecionadoAtual;
    if (parentSelect && paiAtual !== "") parentSelect.value = paiAtual;
}
// Sincronização dos controles
function sincronizarControlesComObjetoSelecionado() {
    if (objetoSelecionadoIndex === -1 || !cena[objetoSelecionadoIndex]) return;
    const obj = cena[objetoSelecionadoIndex];

    document.getElementById("trans-x").value = obj.posicao[0];
    document.getElementById("trans-y").value = obj.posicao[1];
    document.getElementById("trans-z").value = obj.posicao[2];

    document.getElementById("rot-x").value = obj.rotacao[0];
    document.getElementById("rot-y").value = obj.rotacao[1];
    document.getElementById("rot-z").value = obj.rotacao[2];

    document.getElementById("scale").value = obj.escala;
    // Sincronizar Hierarquia
    document.getElementById("parent-select").value = obj.parentId;

    // Sincronizar Animação
    document.getElementById("anim-active").checked = obj.animar;
    document.getElementById("anim-axis").value = obj.animEixo;
    document.getElementById("anim-speed").value = obj.animVelocidade;

   const grupoTextura = document.getElementById("textura-group");
   const selectTextura = document.getElementById("textura-select");
   const opcoes = texturasAlternativasPorModelo[obj.modelo];

    if (opcoes) {
    grupoTextura.style.display = "block";
    selectTextura.innerHTML = "";
    opcoes.forEach((op) => {
        const option = document.createElement("option");
        option.value = op.arquivo;
        option.text = op.nome;
        if (op.materialAlvo) {
            option.dataset.materialAlvo = op.materialAlvo;
        }
        selectTextura.appendChild(option);
    });
} else {
    grupoTextura.style.display = "none";
}
}

function atualizarValoresObjeto() {
    if (objetoSelecionadoIndex === -1 || !cena[objetoSelecionadoIndex]) return;
    const obj = cena[objetoSelecionadoIndex];

    obj.posicao[0] = parseFloat(document.getElementById("trans-x").value);
    obj.posicao[1] = parseFloat(document.getElementById("trans-y").value);
    obj.posicao[2] = parseFloat(document.getElementById("trans-z").value);

    obj.rotacao[0] = parseFloat(document.getElementById("rot-x").value);
    obj.rotacao[1] = parseFloat(document.getElementById("rot-y").value);
    obj.rotacao[2] = parseFloat(document.getElementById("rot-z").value);

    obj.escala = parseFloat(document.getElementById("scale").value);
// Salvar Hierarquia
    const novoPai = parseInt(document.getElementById("parent-select").value);
    // Impede o objeto de ser pai de si mesmo (evita travar o navegador)
    if (novoPai !== objetoSelecionadoIndex) {
        obj.parentId = novoPai;
    }

    // Salvar Animação
    obj.animar = document.getElementById("anim-active").checked;
    obj.animEixo = document.getElementById("anim-axis").value;
    obj.animVelocidade = parseFloat(document.getElementById("anim-speed").value);
    //desenharCena();
}

function grausParaRadianos(graus) {
    return graus * Math.PI / 180;
}


  
function calcularMatrizMundo(index) {
    const obj = cena[index];
    if (!obj) return m4.identity();

    // 1. Matriz Local do objeto
    let localMatrix = m4.translation(obj.posicao[0], obj.posicao[1], obj.posicao[2]);
    localMatrix = m4.xRotate(localMatrix, grausParaRadianos(obj.rotacao[0]));
    localMatrix = m4.yRotate(localMatrix, grausParaRadianos(obj.rotacao[1]));
    localMatrix = m4.zRotate(localMatrix, grausParaRadianos(obj.rotacao[2]));
    localMatrix = m4.scale(localMatrix, obj.escala, obj.escala, obj.escala);

    // 2. Se ele tiver um PAI, calcula a matriz do pai e multiplica pela dele (Gruda nele!)
    if (obj.parentId !== -1 && cena[obj.parentId]) {
        const parentMatrix = calcularMatrizMundo(obj.parentId);
        return m4.multiply(parentMatrix, localMatrix); // O segredo da hierarquia está aqui
    }

    // Se não tiver pai, retorna só a posição local
    return localMatrix;
}


function desenharCena() {
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);

    gl.clearColor(1, 0.99, 0.99, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const tipoProjecao = document.getElementById("projection-type").value;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    let projection;
    if (tipoProjecao === "perspective") {
        projection = m4.perspective(grausParaRadianos(60), aspect, 0.1, 1000);
    } else {
        projection = m4.orthographic(-10 * aspect, 10 * aspect, -10, 10, 0.1, 1000);
    }

    const camera = m4.lookAt([0, 2, 8], [0, 0, -5], [0, 1, 0]);
    const view = m4.inverse(camera);

    const sharedUniforms = {
        u_lightDirection: [0.5, 1, 1],        
        u_view: view,
        u_projection: projection,
        u_viewWorldPosition: [0, 2, 8],
        u_ambientLight: [0.1, 0.1, 0.1],
    };

    gl.useProgram(meshProgramInfo.program);
    twgl.setUniforms(meshProgramInfo, sharedUniforms);

    cena.forEach((objeto, index) => {
        const modelo = modelos3D[objeto.modelo];
        if (!modelo) return;

        let worldMatrix = calcularMatrizMundo(index);
        
        // Centraliza o modelo
        worldMatrix = m4.translate(worldMatrix, ...modelo.objOffset);

      
        for (const { bufferInfo, vao, material, nomeMaterial } of modelo.partes) {
            gl.bindVertexArray(vao);
            
            twgl.setUniforms(meshProgramInfo, material);
            
            let uniformsDaInstancia = { u_world: worldMatrix };
            
            if (objeto.texturasCustomizadas && objeto.texturasCustomizadas[nomeMaterial]) {
                uniformsDaInstancia.diffuseMap = objeto.texturasCustomizadas[nomeMaterial];
            }
            
            twgl.setUniforms(meshProgramInfo, uniformsDaInstancia);
            twgl.drawBufferInfo(gl, bufferInfo);
        }
    });
}

// Loop da animação
let tempoAnterior = performance.now() * 0.001; 

function renderLoop(tempoAtual) {
    tempoAtual *= 0.001; 
    let deltaTempo = tempoAtual - tempoAnterior;
    
   
    if (deltaTempo > 0.1) deltaTempo = 0.010; 
    
    tempoAnterior = tempoAtual;

    // Processa as animações matemáticas
    cena.forEach(obj => {
        if (obj.animar) {
                  const incremento = (obj.animVelocidade * 1) * deltaTempo; 
            
            if (obj.animEixo === 'x') obj.rotacao[0] = (obj.rotacao[0] + incremento) % 360;
            if (obj.animEixo === 'y') obj.rotacao[1] = (obj.rotacao[1] + incremento) % 360;
            if (obj.animEixo === 'z') obj.rotacao[2] = (obj.rotacao[2] + incremento) % 360;
        }
    });

    // Atualiza os sliders visuais apenas se o objeto selecionado estiver animado
    if (objetoSelecionadoIndex !== -1 && cena[objetoSelecionadoIndex]?.animar) {
        document.getElementById("rot-x").value = cena[objetoSelecionadoIndex].rotacao[0];
        document.getElementById("rot-y").value = cena[objetoSelecionadoIndex].rotacao[1];
        document.getElementById("rot-z").value = cena[objetoSelecionadoIndex].rotacao[2];
    }

    desenharCena();
    requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);


// Remover o objeto selecionado da cena
function removerObjetoSelecionado() {
    if (objetoSelecionadoIndex === -1 || !cena[objetoSelecionadoIndex]) {
        console.log("Nenhum objeto selecionado para remover.");
        return;
    }

    const nomeRemovido = cena[objetoSelecionadoIndex].id;
    cena.splice(objetoSelecionadoIndex, 1);

    // Após remover, seleciona o objeto anterior na lista (ou o novo último,
    // se o removido era o último), ou nenhum, se a cena ficou vazia.
    if (cena.length === 0) {
        objetoSelecionadoIndex = -1;
    } else {
        objetoSelecionadoIndex = Math.min(objetoSelecionadoIndex, cena.length - 1);
    }

    atualizarListaDropdown();

    if (objetoSelecionadoIndex !== -1) {
        document.getElementById("item-list").value = objetoSelecionadoIndex;
        sincronizarControlesComObjetoSelecionado();
    }

    console.log(nomeRemovido + " foi removido da cena.");
    desenharCena();
}

// Salva em Json a cena atual, incluindo hierarquia e animação
function salvarCenaComoJSON() {
    const conteudo = JSON.stringify(cena, null, 2);
    const blob = new Blob([conteudo], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "cena.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Libera a URL temporária depois de um instante (boa prática, evita
    // acumular referências de Blob na memória do navegador).
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    console.log("Cena salva como cena.json (" + cena.length + " objeto(s)).");
}

// Lê o arquivo escolhido pelo usuário, substitui a cena atual 
async function carregarCenaDeJSON(arquivo) {
    let dados;
    try {
        const texto = await arquivo.text();
        dados = JSON.parse(texto);
    } catch (erro) {
        alert("Não foi possível ler o arquivo JSON. Verifique se é um arquivo de cena válido.");
        console.error("Erro ao ler JSON da cena:", erro);
        return;
    }

    if (!Array.isArray(dados)) {
        alert("Formato de arquivo inválido: esperava uma lista de objetos.");
        return;
    }

    // Substitui a cena atual pela carregada 
    cena = [];
    objetoSelecionadoIndex = -1;

    for (const item of dados) {
    
        if (!item.modelo) continue;
        try {
            await carregarModelo(item.modelo);
        } catch (erro) {
            console.warn("Não foi possível carregar o modelo do item:", item, erro);
            continue;
        }
        cena.push({
            id: item.id || item.modelo,
            modelo: item.modelo,
            posicao: item.posicao || [0, 0, -5],
            rotacao: item.rotacao || [0, 0, 0],
            escala: typeof item.escala === "number" ? item.escala : 1,
        });
    }

    atualizarListaDropdown();

    if (cena.length > 0) {
        objetoSelecionadoIndex = 0;
        document.getElementById("item-list").value = 0;
        sincronizarControlesComObjetoSelecionado();
    }

    console.log("Cena carregada: " + cena.length + " objeto(s).");
    desenharCena();
}
// Eventos da interface
function configurarEventosDeControle() {

    const controlesUI = [
        "trans-x", "trans-y", "trans-z", 
        "rot-x", "rot-y", "rot-z", 
        "scale", "projection-type",
        "parent-select", "anim-speed", "anim-axis" // controles de hierarquia e animação
    ];
    
    controlesUI.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", () => {
                if (id === "projection-type") {
                    desenharCena(); 
                } else {
                    atualizarValoresObjeto(); // O resto atualiza a matemática do objeto
                }
            });
        }
    });

  
    const checkboxAnim = document.getElementById("anim-active");
    if (checkboxAnim) {
        checkboxAnim.addEventListener("change", atualizarValoresObjeto);
    }
    document.getElementById("item-list").addEventListener("change", (e) => {
        objetoSelecionadoIndex = parseInt(e.target.value);
        sincronizarControlesComObjetoSelecionado();
    });

    document.getElementById("btn-remove").addEventListener("click", removerObjetoSelecionado);
    document.getElementById("btn-save").addEventListener("click", salvarCenaComoJSON);
    
    document.getElementById("state-loader").addEventListener("change", (e) => {
        const arquivo = e.target.files[0];
        if (arquivo) carregarCenaDeJSON(arquivo);
        e.target.value = "";
    });

    const texSelect = document.getElementById("textura-select");
    if(texSelect) {
        texSelect.addEventListener("change", (e) => {
            const select = e.target;
            const opcaoEscolhida = select.selectedOptions[0];
            const materialAlvo = opcaoEscolhida.dataset.materialAlvo || null;
            trocarTexturaDoObjetoSelecionado(select.value, materialAlvo);
        });
    }
}
// Código fonte dos shaders GLSL (cena principal e menu de seleção)
const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec3 a_normal;
in vec2 a_texcoord;
in vec4 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform vec3 u_viewWorldPosition;

out vec3 v_normal;
out vec3 v_surfaceToView;
out vec2 v_texcoord;
out vec4 v_color;

void main() {
  vec4 worldPosition = u_world * a_position;
  gl_Position = u_projection * u_view * worldPosition;
  v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
  v_normal = mat3(u_world) * a_normal;
  v_texcoord = a_texcoord;
  v_color = a_color;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_surfaceToView;
in vec2 v_texcoord;
in vec4 v_color;

uniform vec3 diffuse;
uniform sampler2D diffuseMap;
uniform vec3 ambient;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
uniform vec3 u_lightDirection;
uniform vec3 u_ambientLight;

out vec4 outColor;

void main() {
  vec4 diffuseMapColor = texture(diffuseMap, v_texcoord);
  float effectiveOpacity = opacity * diffuseMapColor.a * v_color.a;

  // CRÍTICO para texturas "cutout" (atlas de folhas, grama, etc.): essas
  // texturas usam o canal alpha para recortar a forma real (ex.: uma folha
  // dentro de um quadrado, com o resto transparente). Sem este discard, o
  // WebGL ainda desenha a cor RGB de cada pixel mesmo onde o alpha é 0 —
  // e como essa área "vazia" da textura costuma ter RGB indefinido/lixo,
  // ela aparecia como manchas pretas (fundo escuro) ou sumiu de vista
  // (fundo claro, quando o RGB residual coincidia com a cor do fundo).
  // Descartar o pixel sempre que ele for quase totalmente transparente
  // resolve os dois sintomas de uma vez, sem precisar de blending.
  if (effectiveOpacity < 0.5) {
    discard;
  }

  vec3 normal = normalize(v_normal);
  vec3 surfaceToViewDirection = normalize(v_surfaceToView);
  vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

  // abs() em vez de max(): folhagem (e outras geometrias finas, como cards
  // de folha) costuma ter faces voltadas em direções opostas, e com apenas
  // max(dot, 0) as faces "de costas" para a luz ficavam completamente pretas
  // (dot negativo zerado). Usar o valor absoluto trata a luz como incidindo
  // nos dois lados da superfície, evitando esse efeito de manchas pretas.
  float fakeLight = abs(dot(normal, normalize(u_lightDirection)));
  // Garante um piso mínimo de luz, para nenhuma face ficar 100% preta mesmo
  // em ângulos quase perpendiculares à luz.
  fakeLight = max(fakeLight, 0.20);
  float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);

  vec3 effectiveDiffuse = diffuse * diffuseMapColor.rgb * v_color.rgb;

  outColor = vec4(
      ambient * u_ambientLight +
      effectiveDiffuse * fakeLight,
      effectiveOpacity);
}
`;

async function main() {
    canvas = document.querySelector("#webgl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("O seu navegador não suporta WebGL2!");
        return;
    }

    twgl.setAttributePrefix("a_");

    const vs = vertexShaderSource;
    const fs = fragmentShaderSource;

    meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);
    texturaBranca = twgl.createTexture(gl, { src: [255, 255, 255, 255] });

    configurarEventosDeControle();

    // A cena nasce vazia 
    desenharCena();
}

main();

