// Cada item do catálogo ganha seu próprio <canvas> com um contexto WebGL2
//Menu em 3D
function carregarTexturaManualEm(glPreview, texturaBrancaPreview, url) {
    return new Promise((resolve) => {
        const imagem = new Image();
        imagem.crossOrigin = "anonymous";
        imagem.onload = () => {
            const textura = glPreview.createTexture();
            glPreview.bindTexture(glPreview.TEXTURE_2D, textura);
            glPreview.pixelStorei(glPreview.UNPACK_FLIP_Y_WEBGL, true);
            glPreview.texImage2D(glPreview.TEXTURE_2D, 0, glPreview.RGBA, glPreview.RGBA, glPreview.UNSIGNED_BYTE, imagem);
            glPreview.pixelStorei(glPreview.UNPACK_FLIP_Y_WEBGL, false);
            glPreview.generateMipmap(glPreview.TEXTURE_2D);
            glPreview.texParameteri(glPreview.TEXTURE_2D, glPreview.TEXTURE_MIN_FILTER, glPreview.LINEAR_MIPMAP_LINEAR);
            glPreview.texParameteri(glPreview.TEXTURE_2D, glPreview.TEXTURE_MAG_FILTER, glPreview.LINEAR);
            glPreview.texParameteri(glPreview.TEXTURE_2D, glPreview.TEXTURE_WRAP_S, glPreview.REPEAT);
            glPreview.texParameteri(glPreview.TEXTURE_2D, glPreview.TEXTURE_WRAP_T, glPreview.REPEAT);
            resolve(textura);
        };
        imagem.onerror = () => resolve(texturaBrancaPreview);
        imagem.src = url;
    });
}

async function carregarModeloParaPreview(glPreview, programInfoPreview, texturaBrancaPreview, nomeFicheiro) {
    const resposta = await fetch(nomeFicheiro);
    if (!resposta.ok) throw new Error("Ficheiro não encontrado: " + nomeFicheiro);
    const texto = await resposta.text();

    const obj = parseOBJ(texto);
    const baseHref = new URL(nomeFicheiro, window.location.href);

    const matTexts = await Promise.all(obj.materialLibs.map(async (filename) => {
        const matHref = new URL(filename, baseHref).href;
        const matResposta = await fetch(matHref);
        if (!matResposta.ok) return "";
        return await matResposta.text();
    }));
    const materials = parseMTL(matTexts.join('\n'));

    const texturas = {};
    const tarefasDeTextura = [];
    for (const material of Object.values(materials)) {
        Object.entries(material)
            .filter(([key]) => key.endsWith('Map'))
            .forEach(([key, filename]) => {
                if (!texturas[filename]) {
                    const textureHref = new URL(filename, baseHref).href;
                    texturas[filename] = carregarTexturaManualEm(glPreview, texturaBrancaPreview, textureHref);
                }
                tarefasDeTextura.push(
                    texturas[filename].then((textura) => { material[key] = textura; })
                );
            });
    }
    await Promise.all(tarefasDeTextura);

    const defaultMaterial = {
        diffuse: [0.8, 0.8, 0.8],
        diffuseMap: texturaBrancaPreview,
        ambient: [0, 0, 0],
        specular: [1, 1, 1],
        shininess: 50,
        opacity: 1,
    };

    const partes = obj.geometries.map(({ material: nomeMaterial, data }) => {
        if (data.color) {
            if (data.position.length === data.color.length) {
                data.color = { numComponents: 3, data: data.color };
            }
        } else {
            data.color = { value: [1, 1, 1, 1] };
        }
        const bufferInfo = twgl.createBufferInfoFromArrays(glPreview, data);
        const vao = twgl.createVAOFromBufferInfo(glPreview, programInfoPreview, bufferInfo);
        return {
            material: { ...defaultMaterial, ...materials[nomeMaterial] },
            bufferInfo,
            vao,
        };
    });

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
    const objOffset = m4.scaleVector(
        m4.addVectors(extents.min, m4.scaleVector(range, 0.5)),
        -1
    );
    const raioAproximado = m4.length(range) * 0.5 || 1;

    return { partes, objOffset, raioAproximado };
}

// Cria o preview de um único modelo dentro de um <canvas> já existente no DOM.
async function criarPreview3D(canvasElement, nomeFicheiro) {
    const glPreview = canvasElement.getContext("webgl2");
    if (!glPreview) return;

    const programInfoPreview = twgl.createProgramInfo(glPreview, [vertexShaderSource, fragmentShaderSource]);
    const texturaBrancaPreview = twgl.createTexture(glPreview, { src: [255, 255, 255, 255] });

    let modelo;
    try {
        modelo = await carregarModeloParaPreview(glPreview, programInfoPreview, texturaBrancaPreview, nomeFicheiro);
    } catch (erro) {
        console.error("Erro ao carregar preview de", nomeFicheiro, erro);
        return;
    }

    let anguloAtual = 0;
    let animando = true;

    function renderPreview() {
        if (!animando) return;

        twgl.resizeCanvasToDisplaySize(glPreview.canvas);
        glPreview.viewport(0, 0, glPreview.canvas.width, glPreview.canvas.height);
        glPreview.enable(glPreview.DEPTH_TEST);
        glPreview.clearColor(0.97, 0.92, 0.94, 1); // rosa bem suave, combinando com o card
        glPreview.clear(glPreview.COLOR_BUFFER_BIT | glPreview.DEPTH_BUFFER_BIT);

        const aspect = glPreview.canvas.clientWidth / glPreview.canvas.clientHeight || 1;
        const raio = modelo.raioAproximado;
        const distanciaCamera = raio * 2.6;

        const projection = m4.perspective(grausParaRadianos(45), aspect, 0.05, distanciaCamera * 10);
        const cameraPosition = [0, raio * 0.4, distanciaCamera];
        const cameraTarget = [0, 0, 0];
        const camera = m4.lookAt(cameraPosition, cameraTarget, [0, 1, 0]);
        const view = m4.inverse(camera);

        glPreview.useProgram(programInfoPreview.program);
        twgl.setUniforms(programInfoPreview, {
            u_view: view,
            u_projection: projection,
            u_viewWorldPosition: cameraPosition,
            u_lightDirection: m4.normalize([1, 1, 1]),
            u_ambientLight: [0.01, 0.01, 0.01],
        });

        anguloAtual += 0.01; // velocidade da rotação automática
        let worldMatrix = m4.yRotation(anguloAtual);
        worldMatrix = m4.translate(worldMatrix, ...modelo.objOffset);

        for (const { bufferInfo, vao, material } of modelo.partes) {
            glPreview.bindVertexArray(vao);
            twgl.setUniforms(programInfoPreview, { u_world: worldMatrix }, material);
            twgl.drawBufferInfo(glPreview, bufferInfo);
        }

        requestAnimationFrame(renderPreview);
    }
    requestAnimationFrame(renderPreview);

    // Para de animar quando o canvas não está visível (economiza GPU/bateria
    // se o menu tiver muitos modelos e o usuário rolar a página).
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            animando = entry.isIntersecting;
            if (animando) requestAnimationFrame(renderPreview);
        });
    }, { threshold: 0.01 });
    observer.observe(canvasElement);
}

// Monta o menu de modelos e um clique que adiciona o modelo à cena.
function montarMenuDeModelos() {
    const container = document.getElementById("model-container");
    if (!container) return;

    container.querySelectorAll(".model-card").forEach(el => el.remove());

    catalogoModelos.forEach((entrada) => {
        const card = document.createElement("div");
        card.className = "model-card";

        const previewCanvas = document.createElement("canvas");
        previewCanvas.className = "model-preview-canvas";
        previewCanvas.width = 150;
        previewCanvas.height = 110;

        const titulo = document.createElement("p");
        titulo.textContent = entrada.nome;

        card.appendChild(previewCanvas);
        card.appendChild(titulo);
        card.addEventListener("click", () => {
            adicionarObjetoNaCena(entrada.nome, entrada.arquivo);
        });

        container.appendChild(card);
        criarPreview3D(previewCanvas, entrada.arquivo);
    });
}

// Espera o main() terminar de configurar antes de montar
window.addEventListener("DOMContentLoaded", () => {
    montarMenuDeModelos();
});