/** Filas con el detalle de un pedido (lo que devolvió el backend). */
export function DetallePedido({ reserva, conReclamo = true, extra = null }) {
  return (
    <dl className="filas">
      <div className="fila"><dt>Almuerzo</dt><dd>{reserva.tipoAlmuerzo?.nombre}</dd></div>
      <div className="fila"><dt>Proteína</dt><dd>{reserva.proteina?.nombre}</dd></div>
      <div className="fila">
        <dt>Acompañamientos</dt>
        <dd>{reserva.acompanamientos.map((a) => <span key={a.idAcompanamiento} style={{ display: 'block' }}>{a.nombre}</span>)}</dd>
      </div>
      {extra}
      {conReclamo && (
        <div className="fila"><dt>Reclamo</dt><dd>{reserva.lugarReclamo.split(' · ').map((parte) => <span key={parte} style={{ display: 'block' }}>{parte}</span>)}</dd></div>
      )}
    </dl>
  );
}
