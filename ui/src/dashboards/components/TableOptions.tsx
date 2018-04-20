import React, {PureComponent} from 'react'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'

import GraphOptionsCustomizeFields from 'src/dashboards/components/GraphOptionsCustomizeFields'
import GraphOptionsFixFirstColumn from 'src/dashboards/components/GraphOptionsFixFirstColumn'
import GraphOptionsSortBy from 'src/dashboards/components/GraphOptionsSortBy'
import GraphOptionsTimeAxis from 'src/dashboards/components/GraphOptionsTimeAxis'
import GraphOptionsTimeFormat from 'src/dashboards/components/GraphOptionsTimeFormat'
import FancyScrollbar from 'src/shared/components/FancyScrollbar'

import _ from 'lodash'

import ThresholdsList from 'src/shared/components/ThresholdsList'
import ThresholdsListTypeToggle from 'src/shared/components/ThresholdsListTypeToggle'

import {
  updateTableOptions,
  updateDisplayOptions,
} from 'src/dashboards/actions/cellEditorOverlay'
import {TIME_FIELD_DEFAULT} from 'src/shared/constants/tableGraph'
import {QueryConfig} from 'src/types/query'
import {ErrorHandling} from 'src/shared/decorators/errors'

interface Option {
  text: string
  key: string
}

interface RenamableField {
  internalName: string
  displayName: string
  visible: boolean
}

interface Options {
  verticalTimeAxis: boolean
  sortBy: RenamableField
  fixFirstColumn: boolean
}

interface Props {
  queryConfigs: QueryConfig[]
  handleUpdateTableOptions: (options: Options) => void
  handleUpdateDisplayOptions: (displayOption: string | RenamableField[]) => void
  tableOptions: Options
  fieldOptions: RenamableField[]
  timeFormat: string
  onResetFocus: () => void
}

@ErrorHandling
export class TableOptions extends PureComponent<Props, {}> {
  constructor(props) {
    super(props)
    this.moveField = this.moveField.bind(this)
  }

  public componentWillMount() {
    const {handleUpdateDisplayOptions, tableOptions} = this.props
    handleUpdateDisplayOptions({
      fieldOptions: this.computedFieldOptions,
    })
  }

  public shouldComponentUpdate(nextProps) {
    const {tableOptions} = this.props
    const tableOptionsDifferent = !_.isEqual(
      tableOptions,
      nextProps.tableOptions
    )

    return tableOptionsDifferent
  }

  public render() {
    const {
      tableOptions: {verticalTimeAxis, fixFirstColumn},
      fieldOptions,
      timeFormat,
      onResetFocus,
      tableOptions,
    } = this.props

    const tableSortByOptions = fieldOptions.map(field => ({
      key: field.internalName,
      text: field.displayName || field.internalName,
    }))

    return (
      <FancyScrollbar
        className="display-options--cell y-axis-controls"
        autoHide={false}
      >
        <div className="display-options--cell-wrapper">
          <h5 className="display-options--header">Table Controls</h5>
          <div className="form-group-wrapper">
            <GraphOptionsTimeFormat
              timeFormat={timeFormat}
              onTimeFormatChange={this.handleTimeFormatChange}
            />
            <GraphOptionsTimeAxis
              verticalTimeAxis={verticalTimeAxis}
              onToggleVerticalTimeAxis={this.handleToggleVerticalTimeAxis}
            />
            <GraphOptionsSortBy
              selected={tableOptions.sortBy || TIME_FIELD_DEFAULT}
              sortByOptions={tableSortByOptions}
              onChooseSortBy={this.handleChooseSortBy}
            />
            <GraphOptionsFixFirstColumn
              fixed={fixFirstColumn}
              onToggleFixFirstColumn={this.handleToggleFixFirstColumn}
            />
          </div>
          <GraphOptionsCustomizeFields
            fields={fieldOptions}
            onFieldUpdate={this.handleFieldUpdate}
            moveField={this.moveField}
          />
          <ThresholdsList showListHeading={true} onResetFocus={onResetFocus} />
          <div className="form-group-wrapper graph-options-group">
            <ThresholdsListTypeToggle containerClass="form-group col-xs-6" />
          </div>
        </div>
      </FancyScrollbar>
    )
  }

  private get fieldOptions() {
    return this.props.fieldOptions || []
  }

  private get timeField() {
    return (
      this.fieldOptions.find(f => f.internalName === 'time') ||
      TIME_FIELD_DEFAULT
    )
  }

  private moveField(dragIndex, hoverIndex) {
    const {handleUpdateDisplayOptions, tableOptions, fieldOptions} = this.props
    const fields =
      fieldOptions.length > 1 ? fieldOptions : this.computedFieldOptions

    const dragField = fields[dragIndex]
    const removedFields = _.concat(
      _.slice(fields, 0, dragIndex),
      _.slice(fields, dragIndex + 1)
    )
    const addedFields = _.concat(
      _.slice(removedFields, 0, hoverIndex),
      [dragField],
      _.slice(removedFields, hoverIndex)
    )
    handleUpdateDisplayOptions({
      fieldOptions: addedFields,
    })
  }

  private get computedFieldOptions() {
    const {queryConfigs} = this.props
    const queryFields = _.flatten(
      queryConfigs.map(({measurement, fields}) => {
        return fields.map(({alias}) => {
          const internalName = `${measurement}.${alias}`
          const existing = this.fieldOptions.find(
            c => c.internalName === internalName
          )
          return existing || {internalName, displayName: '', visible: true}
        })
      })
    )

    return [this.timeField, ...queryFields]
  }

  private handleChooseSortBy = (option: Option) => {
    const {tableOptions, handleUpdateTableOptions} = this.props
    const sortBy = {
      displayName: option.text === option.key ? '' : option.text,
      internalName: option.key,
      visible: true,
    }

    handleUpdateTableOptions({...tableOptions, sortBy})
  }

  private handleTimeFormatChange = timeFormat => {
    const {handleUpdateDisplayOptions} = this.props
    handleUpdateDisplayOptions({timeFormat})
  }

  private handleToggleVerticalTimeAxis = verticalTimeAxis => () => {
    const {tableOptions, handleUpdateTableOptions} = this.props
    handleUpdateTableOptions({...tableOptions, verticalTimeAxis})
  }

  private handleToggleFixFirstColumn = () => {
    const {handleUpdateTableOptions, tableOptions} = this.props
    const fixFirstColumn = !tableOptions.fixFirstColumn
    handleUpdateTableOptions({...tableOptions, fixFirstColumn})
  }

  private handleFieldUpdate = field => {
    const {
      handleUpdateTableOptions,
      handleUpdateDisplayOptions,
      tableOptions,
      fieldOptions,
    } = this.props
    const {sortBy} = tableOptions
    const updatedFields = fieldOptions.map(
      f => (f.internalName === field.internalName ? field : f)
    )
    const updatedSortBy =
      sortBy.internalName === field.internalName
        ? {...sortBy, displayName: field.displayName}
        : sortBy

    handleUpdateTableOptions({
      ...tableOptions,
      sortBy: updatedSortBy,
    })
    handleUpdateDisplayOptions({
      fieldOptions: updatedFields,
    })
  }
}

const mapStateToProps = ({
  cellEditorOverlay: {cell: {tableOptions, timeFormat, fieldOptions}},
}) => ({
  tableOptions,
  timeFormat,
  fieldOptions,
})

const mapDispatchToProps = dispatch => ({
  handleUpdateTableOptions: bindActionCreators(updateTableOptions, dispatch),
  handleUpdateDisplayOptions: bindActionCreators(
    updateDisplayOptions,
    dispatch
  ),
})

export default connect(mapStateToProps, mapDispatchToProps)(TableOptions)
